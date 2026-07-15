const divisionService = require('../services/division.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await divisionService.list(req.query);
  sendSuccess(res, { message: 'Divisions fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const division = await divisionService.getById(req.params.id);
  sendSuccess(res, { message: 'Division fetched', data: division });
});

const create = asyncHandler(async (req, res) => {
  const division = await divisionService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Division created', data: division });
});

const update = asyncHandler(async (req, res) => {
  const division = await divisionService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Division updated', data: division });
});

const remove = asyncHandler(async (req, res) => {
  await divisionService.remove(req.params.id);
  sendSuccess(res, { message: 'Division deleted' });
});

module.exports = { list, getById, create, update, remove };
