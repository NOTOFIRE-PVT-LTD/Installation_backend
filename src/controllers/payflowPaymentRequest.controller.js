const service = require('../services/payflowPaymentRequest.service');
const bulkStatusService = require('../services/payflowBulkStatus.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

function formatBulkStatusMessage(result) {
  const noun = result.updatedCount === 1 ? 'payment request' : 'payment requests';
  const suffix = result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : '';
  return `${result.updatedCount} ${noun} marked as ${result.status}${suffix}`;
}

// Payflow users (non-admin) only ever see requests they submitted themselves.
const scopeOf = (req) => (req.payflowAccess === 'user' ? { ownerId: req.user._id } : {});

module.exports = {
  list: asyncHandler(async (req, res) => {
    const result = await service.list(req.query, scopeOf(req));
    sendSuccess(res, { message: 'Payment requests fetched', data: result.items, meta: result });
  }),
  userOptions: asyncHandler(async (req, res) => {
    sendSuccess(res, { message: 'Users fetched', data: await service.userOptions() });
  }),
  stats: asyncHandler(async (req, res) => {
    sendSuccess(res, { message: 'Payment request stats fetched', data: await service.stats() });
  }),
  addFund: asyncHandler(async (req, res) => {
    sendSuccess(res, { statusCode: 201, message: 'Fund added', data: await service.addFund(req.body, req.user) });
  }),
  exportSummary: asyncHandler(async (req, res) => {
    sendSuccess(res, { message: 'Export preview fetched', data: await service.exportSummary(req.query) });
  }),
  exportExcel: asyncHandler(async (req, res) => {
    const buffer = await service.exportWorkbook(req.query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  }),
  getById: asyncHandler(async (req, res) => {
    const doc = await service.getById(req.params.id, scopeOf(req));
    const allowedStatuses = req.payflowAccess === 'user' || doc.isDeleted ? [] : service.STATUS_TRANSITIONS[doc.status];
    sendSuccess(res, { message: 'Payment request fetched', data: { ...doc.toObject(), allowedStatuses } });
  }),
  create: asyncHandler(async (req, res) => {
    const doc = await service.create(req.body, req.user);
    sendSuccess(res, { statusCode: 201, message: 'Payment request created', data: doc });
  }),
  changeStatus: asyncHandler(async (req, res) => {
    const doc = await service.changeStatus(req.params.id, req.body, req.user);
    sendSuccess(res, { message: `Payment request marked as ${doc.status}`, data: { ...doc.toObject(), allowedStatuses: service.STATUS_TRANSITIONS[doc.status] } });
  }),
  bulkChangeStatus: asyncHandler(async (req, res) => {
    const result = await bulkStatusService.bulkChangeStatus(req.body, req.user);
    sendSuccess(res, { message: formatBulkStatusMessage(result), data: result });
  }),
  moveToTrash: asyncHandler(async (req, res) => {
    const doc = await service.moveToTrash(req.params.id, req.user);
    sendSuccess(res, { message: 'Payment request moved to trash', data: { ...doc.toObject(), allowedStatuses: [] } });
  }),
  restoreFromTrash: asyncHandler(async (req, res) => {
    const doc = await service.restoreFromTrash(req.params.id, req.user);
    sendSuccess(res, {
      message: 'Payment request restored from trash',
      data: { ...doc.toObject(), allowedStatuses: service.STATUS_TRANSITIONS[doc.status] },
    });
  }),
  deletePermanently: asyncHandler(async (req, res) => {
    await service.deletePermanently(req.params.id);
    sendSuccess(res, { message: 'Payment request permanently deleted' });
  }),
};
