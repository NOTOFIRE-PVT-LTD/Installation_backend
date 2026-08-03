const bgApplicationService = require('../services/bgApplication.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await bgApplicationService.list(req.query);
  sendSuccess(res, { message: 'BG applications fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const entry = await bgApplicationService.getById(req.params.id);
  sendSuccess(res, { message: 'BG application fetched', data: entry });
});

const create = asyncHandler(async (req, res) => {
  const entry = await bgApplicationService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'BG application created', data: entry });
});

const update = asyncHandler(async (req, res) => {
  const entry = await bgApplicationService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'BG application updated', data: entry });
});

const remove = asyncHandler(async (req, res) => {
  await bgApplicationService.remove(req.params.id);
  sendSuccess(res, { message: 'BG application deleted' });
});

module.exports = { list, getById, create, update, remove };
