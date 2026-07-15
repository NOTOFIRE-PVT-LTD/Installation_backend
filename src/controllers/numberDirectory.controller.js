const numberDirectoryService = require('../services/numberDirectory.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const result = await numberDirectoryService.list(req.query);
  sendSuccess(res, { message: 'Entries fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const entry = await numberDirectoryService.getById(req.params.id);
  sendSuccess(res, { message: 'Entry fetched', data: entry });
});

const create = asyncHandler(async (req, res) => {
  const entry = await numberDirectoryService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Entry created', data: entry });
});

const update = asyncHandler(async (req, res) => {
  const entry = await numberDirectoryService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Entry updated', data: entry });
});

const remove = asyncHandler(async (req, res) => {
  await numberDirectoryService.remove(req.params.id);
  sendSuccess(res, { message: 'Entry deleted' });
});

const importFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'A file is required');
  const result = await numberDirectoryService.bulkImport(req.file, req.body.category, req.user._id);
  sendSuccess(res, {
    message: `Imported ${result.inserted} of ${result.total} rows (${result.skipped} skipped as duplicates)`,
    data: result,
  });
});

module.exports = { list, getById, create, update, remove, importFile };
