const paymentService = require('../services/payment.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await paymentService.list(req.query);
  sendSuccess(res, { message: 'Payments fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const payment = await paymentService.getById(req.params.id);
  sendSuccess(res, { message: 'Payment fetched', data: payment });
});

const create = asyncHandler(async (req, res) => {
  const payment = await paymentService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Payment created', data: payment });
});

const update = asyncHandler(async (req, res) => {
  const payment = await paymentService.update(req.params.id, req.body);
  sendSuccess(res, { message: 'Payment updated', data: payment });
});

const remove = asyncHandler(async (req, res) => {
  await paymentService.remove(req.params.id);
  sendSuccess(res, { message: 'Payment deleted' });
});

const updateStatus = asyncHandler(async (req, res) => {
  const payment = await paymentService.updateStatus(req.params.id, req.body.status, req.user._id);
  sendSuccess(res, { message: 'Payment status updated', data: payment });
});

module.exports = { list, getById, create, update, remove, updateStatus };
