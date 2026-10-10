const quotationService = require('../services/quotation.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

function quotationScope(user) {
  if (!user?.permissions?.quotationsOwnOnly) return null;
  return { userId: user._id, userName: user.name };
}

const listMasters = asyncHandler(async (req, res) => {
  const result = await quotationService.listMasters(req.params.kind, req.query);
  if (Array.isArray(result)) {
    sendSuccess(res, { message: 'Records fetched', data: result });
    return;
  }
  const { items, ...meta } = result;
  sendSuccess(res, { message: 'Records fetched', data: items, meta });
});

const createMaster = asyncHandler(async (req, res) => {
  const item = await quotationService.createMaster(req.params.kind, req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Record created', data: item });
});

const updateMaster = asyncHandler(async (req, res) => {
  const item = await quotationService.updateMaster(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Record updated', data: item });
});

const removeMaster = asyncHandler(async (req, res) => {
  await quotationService.removeMaster(req.params.id);
  sendSuccess(res, { message: 'Record deleted' });
});

const listProducts = asyncHandler(async (req, res) => {
  const items = await quotationService.listProducts(req.query);
  sendSuccess(res, { message: 'Products fetched', data: items });
});

const productCategories = asyncHandler(async (_req, res) => {
  const items = await quotationService.productCategories();
  sendSuccess(res, { message: 'Categories fetched', data: items });
});

const createProduct = asyncHandler(async (req, res) => {
  const item = await quotationService.createProduct(req.body, req.files, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Product created', data: item });
});

const updateProduct = asyncHandler(async (req, res) => {
  const item = await quotationService.updateProduct(req.params.id, req.body, req.files, req.user._id);
  sendSuccess(res, { message: 'Product updated', data: item });
});

const removeProduct = asyncHandler(async (req, res) => {
  await quotationService.removeProduct(req.params.id);
  sendSuccess(res, { message: 'Product deleted' });
});

const productOptions = asyncHandler(async (_req, res) => {
  const items = await quotationService.productOptions();
  sendSuccess(res, { message: 'Products fetched', data: items });
});

const listQuotations = asyncHandler(async (req, res) => {
  const result = await quotationService.listQuotations(req.query, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotations fetched', data: result.items, meta: result });
});

const getQuotationById = asyncHandler(async (req, res) => {
  const quotation = await quotationService.getQuotationById(req.params.id, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotation fetched', data: quotation });
});

const createQuotation = asyncHandler(async (req, res) => {
  const quotation = await quotationService.createQuotation(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Quotation created', data: quotation });
});

const updateQuotation = asyncHandler(async (req, res) => {
  const quotation = await quotationService.updateQuotation(
    req.params.id,
    req.body,
    req.user._id,
    quotationScope(req.user)
  );
  sendSuccess(res, { message: 'Quotation updated', data: quotation });
});

const duplicateQuotation = asyncHandler(async (req, res) => {
  const quotation = await quotationService.duplicateQuotation(req.params.id, req.user._id, quotationScope(req.user));
  sendSuccess(res, { statusCode: 201, message: 'Quotation duplicated', data: quotation });
});

const setStatus = asyncHandler(async (req, res) => {
  const quotation = await quotationService.setStatus(
    req.params.id,
    req.body.status,
    req.user._id,
    quotationScope(req.user)
  );
  sendSuccess(res, { message: 'Status updated', data: quotation });
});

const moveToTrash = asyncHandler(async (req, res) => {
  await quotationService.moveToTrash(req.params.id, req.user._id, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotation moved to trash' });
});

const restoreFromTrash = asyncHandler(async (req, res) => {
  const quotation = await quotationService.restoreFromTrash(req.params.id, req.user._id, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotation restored', data: quotation });
});

const deletePermanently = asyncHandler(async (req, res) => {
  await quotationService.deletePermanently(req.params.id, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotation deleted permanently' });
});

module.exports = {
  listMasters,
  createMaster,
  updateMaster,
  removeMaster,
  listProducts,
  productCategories,
  createProduct,
  updateProduct,
  removeProduct,
  productOptions,
  listQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  duplicateQuotation,
  setStatus,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
};
