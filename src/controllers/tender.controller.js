const tenderService = require('../services/tender.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await tenderService.list(req.query);
  sendSuccess(res, { message: 'Tenders fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const tender = await tenderService.getById(req.params.id);
  sendSuccess(res, { message: 'Tender fetched', data: tender });
});

const create = asyncHandler(async (req, res) => {
  const tender = await tenderService.create(req.body, req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Tender created', data: tender });
});

const update = asyncHandler(async (req, res) => {
  const tender = await tenderService.update(req.params.id, req.body, req.files, req.body.removeFileIds, req.user._id);
  sendSuccess(res, { message: 'Tender updated', data: tender });
});

const remove = asyncHandler(async (req, res) => {
  await tenderService.remove(req.params.id);
  sendSuccess(res, { message: 'Tender deleted' });
});

module.exports = { list, getById, create, update, remove };
