const ApiError = require('../utils/ApiError');
const { PayflowPaymentRequest, PAYMENT_REQUEST_STATUSES } = require('../models/PayflowPaymentRequest.model');
const { STATUS_TRANSITIONS } = require('./payflowPaymentRequest.service');

const MAX_BULK_STATUS_IDS = 10;
const REMARK_REQUIRED_STATUSES = ['Rejected', 'Query'];

function validateBulkPayload({ ids, status, remark }) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new ApiError(400, 'Select at least one payment request');
  if (uniqueIds.length > MAX_BULK_STATUS_IDS) {
    throw new ApiError(400, `Maximum ${MAX_BULK_STATUS_IDS} payment requests can be updated at once`);
  }
  if (!PAYMENT_REQUEST_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');

  const trimmedRemark = String(remark || '').trim();
  if (REMARK_REQUIRED_STATUSES.includes(status) && !trimmedRemark) {
    throw new ApiError(400, `A remark is required to mark requests as ${status}`);
  }
  return { uniqueIds, status, trimmedRemark };
}

function getSkipReason(doc, targetStatus) {
  if (!doc) return 'Payment request not found';
  if (doc.isDeleted) return 'Request is in trash';
  const allowed = STATUS_TRANSITIONS[doc.status] || [];
  if (!allowed.includes(targetStatus)) {
    return `A ${doc.status.toLowerCase()} request cannot be moved to ${targetStatus}`;
  }
  return null;
}

async function applyStatusUpdate(doc, targetStatus, trimmedRemark, actorId) {
  const from = doc.status;
  doc.history.push({ from, to: targetStatus, remark: trimmedRemark, by: actorId });
  doc.status = targetStatus;
  doc.updatedBy = actorId;
  await doc.save();
  return { _id: doc._id, srNo: doc.srNo, from, to: targetStatus };
}

async function processRequestId(id, docMap, targetStatus, trimmedRemark, actorId) {
  const doc = docMap.get(id);
  const reason = getSkipReason(doc, targetStatus);
  if (reason) {
    return { skipped: { _id: id, srNo: doc?.srNo ?? null, status: doc?.status ?? null, reason } };
  }
  const updated = await applyStatusUpdate(doc, targetStatus, trimmedRemark, actorId);
  return { updated };
}

async function bulkChangeStatus(payload, actor) {
  const { uniqueIds, status, trimmedRemark } = validateBulkPayload(payload);
  const docs = await PayflowPaymentRequest.find({ _id: { $in: uniqueIds } });
  const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));

  const updated = [];
  const skipped = [];
  for (const id of uniqueIds) {
    const outcome = await processRequestId(id, docMap, status, trimmedRemark, actor._id);
    if (outcome.updated) updated.push(outcome.updated);
    else skipped.push(outcome.skipped);
  }

  if (updated.length === 0) {
    throw new ApiError(400, skipped[0]?.reason || `None of the selected requests can be moved to ${status}`);
  }

  return { status, updated, skipped, updatedCount: updated.length, skippedCount: skipped.length };
}

module.exports = {
  MAX_BULK_STATUS_IDS,
  validateBulkPayload,
  getSkipReason,
  bulkChangeStatus,
};
