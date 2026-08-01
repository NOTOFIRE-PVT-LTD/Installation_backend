const inspectionService = require('../services/inspection.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await inspectionService.list(req.query);
  sendSuccess(res, { message: 'Inspections fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const inspection = await inspectionService.getById(req.params.id);
  sendSuccess(res, { message: 'Inspection fetched', data: inspection });
});

const create = asyncHandler(async (req, res) => {
  const inspection = await inspectionService.create(req.body, req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Inspection created', data: inspection });
});

const update = asyncHandler(async (req, res) => {
  const inspection = await inspectionService.update(req.params.id, req.body, req.files, req.user._id);
  sendSuccess(res, { message: 'Inspection updated', data: inspection });
});

const remove = asyncHandler(async (req, res) => {
  await inspectionService.remove(req.params.id);
  sendSuccess(res, { message: 'Inspection deleted' });
});

module.exports = { list, getById, create, update, remove };
