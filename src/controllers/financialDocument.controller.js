const financialDocumentService = require('../services/financialDocument.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await financialDocumentService.list(req.query);
  sendSuccess(res, { message: 'Financial documents fetched', data: result.items, meta: result });
});

const options = asyncHandler(async (req, res) => {
  const items = await financialDocumentService.options();
  sendSuccess(res, { message: 'Financial document options fetched', data: items });
});

const getById = asyncHandler(async (req, res) => {
  const doc = await financialDocumentService.getById(req.params.id);
  sendSuccess(res, { message: 'Financial document fetched', data: doc });
});

const create = asyncHandler(async (req, res) => {
  const doc = await financialDocumentService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Financial document created', data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await financialDocumentService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Financial document updated', data: doc });
});

const remove = asyncHandler(async (req, res) => {
  await financialDocumentService.remove(req.params.id);
  sendSuccess(res, { message: 'Financial document deleted' });
});

module.exports = { list, options, getById, create, update, remove };
