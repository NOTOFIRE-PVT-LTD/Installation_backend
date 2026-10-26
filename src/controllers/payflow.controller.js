const payflowService = require('../services/payflow.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { PAYFLOW_RESOURCES } = require('../config/payflow.config');

// Builds the CRUD handlers for one Payflow resource (e.g. 'vendors').
function buildController(resource) {
  const label = PAYFLOW_RESOURCES[resource].label;

  return {
    list: asyncHandler(async (req, res) => {
      const result = await payflowService.list(resource, req.query);
      sendSuccess(res, { message: `${label}s fetched`, data: result.items, meta: result });
    }),
    getById: asyncHandler(async (req, res) => {
      const doc = await payflowService.getById(resource, req.params.id);
      sendSuccess(res, { message: `${label} fetched`, data: doc });
    }),
    create: asyncHandler(async (req, res) => {
      const doc = await payflowService.create(resource, req.body, req.user._id);
      sendSuccess(res, { statusCode: 201, message: `${label} created`, data: doc });
    }),
    update: asyncHandler(async (req, res) => {
      const doc = await payflowService.update(resource, req.params.id, req.body, req.user._id);
      sendSuccess(res, { message: `${label} updated`, data: doc });
    }),
    remove: asyncHandler(async (req, res) => {
      await payflowService.remove(resource, req.params.id);
      sendSuccess(res, { message: `${label} deleted` });
    }),
  };
}

module.exports = { buildController };
