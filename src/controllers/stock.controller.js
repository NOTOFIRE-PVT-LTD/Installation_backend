const stockService = require('../services/stock.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listItems = asyncHandler(async (req, res) => {
  const result = await stockService.listItems(req.query);
  sendSuccess(res, { message: 'Stock items fetched', data: result.items, meta: result });
});

const itemOptions = asyncHandler(async (req, res) => {
  const items = await stockService.itemOptions();
  sendSuccess(res, { message: 'Stock item options fetched', data: items });
});

const warehouseSummary = asyncHandler(async (req, res) => {
  const items = await stockService.warehouseSummary();
  sendSuccess(res, { message: 'Warehouse summary fetched', data: items });
});

const getItemById = asyncHandler(async (req, res) => {
  const item = await stockService.getItemById(req.params.id);
  sendSuccess(res, { message: 'Stock item fetched', data: item });
});

const listCatalog = asyncHandler(async (req, res) => {
  const items = await stockService.listCatalog(req.query);
  sendSuccess(res, { message: 'Stock catalog fetched', data: items });
});

const createCatalog = asyncHandler(async (req, res) => {
  const item = await stockService.createCatalog(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Catalog item added', data: item });
});

const createItem = asyncHandler(async (req, res) => {
  const item = await stockService.createItem(req.body, req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Stock item created', data: item });
});

const importItems = asyncHandler(async (req, res) => {
  const result = await stockService.bulkImportItems(req.file, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Stock items imported', data: result });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await stockService.updateItem(req.params.id, req.body, req.files, req.user._id);
  sendSuccess(res, { message: 'Stock item updated', data: item });
});

const removeItem = asyncHandler(async (req, res) => {
  await stockService.removeItem(req.params.id);
  sendSuccess(res, { message: 'Stock item deleted' });
});

const listMovements = asyncHandler(async (req, res) => {
  const result = await stockService.listMovements(req.query);
  sendSuccess(res, { message: 'Stock movements fetched', data: result.items, meta: result });
});

const createMovement = asyncHandler(async (req, res) => {
  const movement = await stockService.createMovement(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Stock movement recorded', data: movement });
});

const updateMovement = asyncHandler(async (req, res) => {
  const movement = await stockService.updateMovement(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Stock movement updated', data: movement });
});

const removeMovement = asyncHandler(async (req, res) => {
  await stockService.removeMovement(req.params.id);
  sendSuccess(res, { message: 'Stock movement deleted' });
});

module.exports = {
  listCatalog,
  createCatalog,
  listItems,
  itemOptions,
  warehouseSummary,
  getItemById,
  createItem,
  importItems,
  updateItem,
  removeItem,
  listMovements,
  createMovement,
  updateMovement,
  removeMovement,
};
