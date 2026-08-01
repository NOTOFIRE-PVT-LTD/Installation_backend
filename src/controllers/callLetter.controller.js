const callLetterService = require('../services/callLetter.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await callLetterService.list(req.query);
  sendSuccess(res, { message: 'Call letters fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const doc = await callLetterService.getById(req.params.id);
  sendSuccess(res, { message: 'Call letter fetched', data: doc });
});

const create = asyncHandler(async (req, res) => {
  const doc = await callLetterService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Call letter created', data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await callLetterService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Call letter updated', data: doc });
});

const remove = asyncHandler(async (req, res) => {
  await callLetterService.remove(req.params.id);
  sendSuccess(res, { message: 'Call letter deleted' });
});

module.exports = { list, getById, create, update, remove };
