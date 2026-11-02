const salesTravelRequestService = require('../services/salesTravelRequest.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { ROLES } = require('../config/constants');

function salesTravelScope(user) {
  if (user?.role === ROLES.ADMIN && !user?.permissions?.salesTravelRequestsOwnOnly) {
    return null;
  }
  return {
    userId: user?._id,
    userName: user?.name,
  };
}

function parsePayload(req) {
  if (typeof req.body?.payload !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body.payload);
  } catch {
    throw new ApiError(400, 'Invalid form data');
  }
}

const list = asyncHandler(async (req, res) => {
  const { items, ...meta } = await salesTravelRequestService.listSalesTravelRequests(
    req.query,
    salesTravelScope(req.user)
  );
  sendSuccess(res, { message: 'Sales travel requests fetched', data: items, meta });
});

const getById = asyncHandler(async (req, res) => {
  const doc = await salesTravelRequestService.getSalesTravelRequestById(
    req.params.id,
    salesTravelScope(req.user)
  );
  sendSuccess(res, { message: 'Sales travel request fetched', data: doc });
});

const create = asyncHandler(async (req, res) => {
  const doc = await salesTravelRequestService.createSalesTravelRequest(
    parsePayload(req),
    req.files,
    req.user._id,
    salesTravelScope(req.user)
  );
  sendSuccess(res, { statusCode: 201, message: 'Travel request submitted', data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await salesTravelRequestService.updateSalesTravelRequest(
    req.params.id,
    parsePayload(req),
    req.files,
    req.user._id,
    salesTravelScope(req.user)
  );
  sendSuccess(res, { message: 'Travel request updated', data: doc });
});

const updateStatus = asyncHandler(async (req, res) => {
  if (salesTravelScope(req.user) !== null) {
    throw new ApiError(403, 'Only admins can update request status');
  }
  const doc = await salesTravelRequestService.updateSalesTravelRequestStatus(
    req.params.id,
    req.body,
    req.user._id
  );
  sendSuccess(res, { message: `Travel request marked as ${doc.status}`, data: doc });
});

const remove = asyncHandler(async (req, res) => {
  await salesTravelRequestService.removeSalesTravelRequest(
    req.params.id,
    salesTravelScope(req.user)
  );
  sendSuccess(res, { message: 'Travel request deleted' });
});

module.exports = {
  list,
  getById,
  create,
  update,
  updateStatus,
  remove,
};

