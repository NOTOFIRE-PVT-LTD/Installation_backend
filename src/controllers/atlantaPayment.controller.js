const atlantaPaymentService = require('../services/atlantaPayment.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');

/** Form data arrives as multipart (for proof files) with the fields JSON-encoded in `payload`. */
function parsePayload(req) {
  if (typeof req.body?.payload !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body.payload);
  } catch {
    throw new ApiError(400, 'Invalid form data');
  }
}

const list = asyncHandler(async (req, res) => {
  const { items, ...meta } = await atlantaPaymentService.listAtlantaPayments(req.query);
  sendSuccess(res, { message: 'Payment entries fetched', data: items, meta });
});

const getById = asyncHandler(async (req, res) => {
  const payment = await atlantaPaymentService.getAtlantaPaymentById(req.params.id);
  sendSuccess(res, { message: 'Payment entry fetched', data: payment });
});

const create = asyncHandler(async (req, res) => {
  const payment = await atlantaPaymentService.createAtlantaPayment(parsePayload(req), req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Payment entry created', data: payment });
});

const update = asyncHandler(async (req, res) => {
  const payment = await atlantaPaymentService.updateAtlantaPayment(req.params.id, parsePayload(req), req.files, req.user._id);
  sendSuccess(res, { message: 'Payment entry updated', data: payment });
});

const remove = asyncHandler(async (req, res) => {
  await atlantaPaymentService.removeAtlantaPayment(req.params.id);
  sendSuccess(res, { message: 'Payment entry deleted' });
});

module.exports = { list, getById, create, update, remove };
