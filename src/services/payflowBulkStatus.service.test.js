const test = require('node:test');
const assert = require('node:assert/strict');
const { PayflowPaymentRequest } = require('../models/PayflowPaymentRequest.model');
const {
  MAX_BULK_STATUS_IDS,
  validateBulkPayload,
  getSkipReason,
  bulkChangeStatus,
} = require('./payflowBulkStatus.service');

const ID_A = '65f000000000000000000001';
const ID_B = '65f000000000000000000002';
const ID_C = '65f000000000000000000003';
const ACTOR = { _id: '65f000000000000000000099' };

function makeDoc(id, srNo, status, isDeleted = false) {
  return {
    _id: id,
    srNo,
    status,
    isDeleted,
    history: [],
    updatedBy: null,
    saved: false,
    async save() {
      this.saved = true;
    },
  };
}

test('validateBulkPayload enforces count bounds and required remarks', () => {
  assert.throws(() => validateBulkPayload({ ids: [], status: 'Approved' }), /Select at least one/);
  const eleven = Array.from({ length: MAX_BULK_STATUS_IDS + 1 }, (_, i) => `id-${i}`);
  assert.throws(() => validateBulkPayload({ ids: eleven, status: 'Approved' }), /Maximum 10/);
  assert.throws(() => validateBulkPayload({ ids: [ID_A], status: 'Rejected', remark: '   ' }), /remark is required/i);
  assert.throws(() => validateBulkPayload({ ids: [ID_A], status: 'Query', remark: '' }), /remark is required/i);

  const valid = validateBulkPayload({ ids: [ID_A, ID_A, ID_B], status: 'Approved', remark: '  ok  ' });
  assert.deepEqual(valid.uniqueIds, [ID_A, ID_B]);
  assert.equal(valid.trimmedRemark, 'ok');
});

test('getSkipReason enforces STATUS_TRANSITIONS and trash guard', () => {
  assert.match(getSkipReason(null, 'Approved'), /not found/i);
  assert.match(getSkipReason({ status: 'Pending', isDeleted: true }, 'Approved'), /trash/i);
  assert.equal(getSkipReason({ status: 'Pending', isDeleted: false }, 'Approved'), null);
  assert.match(getSkipReason({ status: 'Pending', isDeleted: false }, 'Processed'), /cannot be moved to Processed/);
  assert.equal(getSkipReason({ status: 'Approved', isDeleted: false }, 'Processed'), null);
  assert.match(getSkipReason({ status: 'Processed', isDeleted: false }, 'Rejected'), /cannot be moved/);
});

test('bulkChangeStatus updates eligible docs and skips ineligible ones', async () => {
  const originalFind = PayflowPaymentRequest.find;
  const docPending = makeDoc(ID_A, 4348, 'Pending');
  const docApproved = makeDoc(ID_B, 4347, 'Approved');
  const docProcessed = makeDoc(ID_C, 4346, 'Processed');
  PayflowPaymentRequest.find = async () => [docPending, docApproved, docProcessed];

  try {
    const res = await bulkChangeStatus({ ids: [ID_A, ID_B, ID_C], status: 'Approved', remark: 'Batch OK' }, ACTOR);
    assert.equal(res.updatedCount, 1);
    assert.equal(res.skippedCount, 2);
    assert.equal(docPending.status, 'Approved');
    assert.equal(docPending.saved, true);
    assert.equal(docPending.history.length, 1);
    assert.equal(docPending.history[0].from, 'Pending');
    assert.equal(docPending.history[0].to, 'Approved');
    assert.equal(docApproved.saved, false);
    assert.equal(docProcessed.saved, false);
  } finally {
    PayflowPaymentRequest.find = originalFind;
  }
});

test('bulkChangeStatus throws 400 when zero selected requests are eligible', async () => {
  const originalFind = PayflowPaymentRequest.find;
  PayflowPaymentRequest.find = async () => [makeDoc(ID_A, 4348, 'Pending')];

  try {
    await assert.rejects(
      () => bulkChangeStatus({ ids: [ID_A], status: 'Processed' }, ACTOR),
      /cannot be moved to Processed/
    );
  } finally {
    PayflowPaymentRequest.find = originalFind;
  }
});
