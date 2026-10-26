const service = require('../services/payflowPaymentRequest.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

module.exports = {
  list: asyncHandler(async (req, res) => {
    const result = await service.list(req.query);
    sendSuccess(res, { message: 'Payment requests fetched', data: result.items, meta: result });
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
    const doc = await service.getById(req.params.id);
    sendSuccess(res, { message: 'Payment request fetched', data: { ...doc.toObject(), allowedStatuses: service.STATUS_TRANSITIONS[doc.status] } });
  }),
  create: asyncHandler(async (req, res) => {
    const doc = await service.create(req.body, req.user);
    sendSuccess(res, { statusCode: 201, message: 'Payment request created', data: doc });
  }),
  changeStatus: asyncHandler(async (req, res) => {
    const doc = await service.changeStatus(req.params.id, req.body, req.user);
    sendSuccess(res, { message: `Payment request marked as ${doc.status}`, data: { ...doc.toObject(), allowedStatuses: service.STATUS_TRANSITIONS[doc.status] } });
  }),
};
