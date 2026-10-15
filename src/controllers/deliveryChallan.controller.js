const deliveryChallanService = require('../services/deliveryChallan.service');
const quotationService = require('../services/quotation.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');

/** Form data arrives as multipart (for attachments) with the fields JSON-encoded in `payload`. */
function parsePayload(req) {
  if (typeof req.body?.payload !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body.payload);
  } catch {
    throw new ApiError(400, 'Invalid form data');
  }
}

const listDeliveryChallans = asyncHandler(async (req, res) => {
  const { items, ...meta } = await deliveryChallanService.listDeliveryChallans(req.query);
  sendSuccess(res, { message: 'Delivery Challans fetched', data: items, meta });
});

const getDeliveryChallanById = asyncHandler(async (req, res) => {
  const dc = await deliveryChallanService.getDeliveryChallanById(req.params.id);
  sendSuccess(res, { message: 'Delivery Challan fetched', data: dc });
});

const createDeliveryChallan = asyncHandler(async (req, res) => {
  const dc = await deliveryChallanService.createDeliveryChallan(parsePayload(req), req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Delivery Challan created', data: dc });
});

const updateDeliveryChallan = asyncHandler(async (req, res) => {
  const dc = await deliveryChallanService.updateDeliveryChallan(req.params.id, parsePayload(req), req.files, req.user._id);
  sendSuccess(res, { message: 'Delivery Challan updated', data: dc });
});

const removeDeliveryChallan = asyncHandler(async (req, res) => {
  await deliveryChallanService.removeDeliveryChallan(req.params.id);
  sendSuccess(res, { message: 'Delivery Challan deleted' });
});

const suggestNumbers = asyncHandler(async (req, res) => {
  const result = await deliveryChallanService.suggestNumbers(req.query);
  sendSuccess(res, { message: 'DC numbers suggested', data: result });
});

const listCompanies = asyncHandler(async (_req, res) => {
  const items = await quotationService.listMasters('company');
  sendSuccess(res, { message: 'Companies fetched', data: items });
});

const listParties = asyncHandler(async (_req, res) => {
  const items = await quotationService.listMasters('party');
  sendSuccess(res, { message: 'Parties fetched', data: items });
});

module.exports = {
  listDeliveryChallans,
  getDeliveryChallanById,
  createDeliveryChallan,
  updateDeliveryChallan,
  removeDeliveryChallan,
  suggestNumbers,
  listCompanies,
  listParties,
};
