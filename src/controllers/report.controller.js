const reportService = require('../services/report.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await reportService.list(req.query, req.user);
  sendSuccess(res, { message: 'Reports fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const report = await reportService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Report fetched', data: report });
});

const create = asyncHandler(async (req, res) => {
  const report = await reportService.create(req.body, req.files, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Report submitted', data: report });
});

const update = asyncHandler(async (req, res) => {
  const report = await reportService.update(req.params.id, req.body, req.files, req.user);
  sendSuccess(res, { message: 'Report updated', data: report });
});

const remove = asyncHandler(async (req, res) => {
  await reportService.remove(req.params.id);
  sendSuccess(res, { message: 'Report deleted' });
});

const verify = asyncHandler(async (req, res) => {
  const report = await reportService.verify(req.params.id, req.user._id);
  sendSuccess(res, { message: 'Report verified', data: report });
});

module.exports = { list, getById, create, update, remove, verify };
