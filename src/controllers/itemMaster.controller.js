const itemMasterService = require('../services/itemMaster.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listCatalog = asyncHandler(async (req, res) => {
  const items = await itemMasterService.listCatalog(req.query);
  sendSuccess(res, { message: 'Item master catalog fetched', data: items });
});

const createCatalog = asyncHandler(async (req, res) => {
  const entry = await itemMasterService.createCatalog(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Catalog entry added', data: entry });
});

const removeCatalog = asyncHandler(async (req, res) => {
  await itemMasterService.removeCatalog(req.params.id);
  sendSuccess(res, { message: 'Catalog entry removed' });
});

const listItems = asyncHandler(async (req, res) => {
  const result = await itemMasterService.listItems(req.query);
  sendSuccess(res, { message: 'Master items fetched', data: result.items, meta: result });
});

const getItemById = asyncHandler(async (req, res) => {
  const item = await itemMasterService.getItemById(req.params.id);
  sendSuccess(res, { message: 'Master item fetched', data: item });
});

const createItem = asyncHandler(async (req, res) => {
  const item = await itemMasterService.createItem(req.body, req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Master item created', data: item });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await itemMasterService.updateItem(req.params.id, req.body, req.files, req.user._id);
  sendSuccess(res, { message: 'Master item updated', data: item });
});

const removeItem = asyncHandler(async (req, res) => {
  await itemMasterService.removeItem(req.params.id);
  sendSuccess(res, { message: 'Master item deleted' });
});

module.exports = {
  listCatalog,
  createCatalog,
  removeCatalog,
  listItems,
  getItemById,
  createItem,
  updateItem,
  removeItem,
};
