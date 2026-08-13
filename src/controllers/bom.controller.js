const bomService = require('../services/bom.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listBoms = asyncHandler(async (req, res) => {
  const result = await bomService.listBoms(req.query);
  sendSuccess(res, { message: 'BOMs fetched', data: result.items, meta: result });
});

const getBomById = asyncHandler(async (req, res) => {
  const bom = await bomService.getBomById(req.params.id);
  sendSuccess(res, { message: 'BOM fetched', data: bom });
});

const createBom = asyncHandler(async (req, res) => {
  const bom = await bomService.createBom(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'BOM created', data: bom });
});

const updateBom = asyncHandler(async (req, res) => {
  const bom = await bomService.updateBom(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'BOM updated', data: bom });
});

const removeBom = asyncHandler(async (req, res) => {
  await bomService.removeBom(req.params.id);
  sendSuccess(res, { message: 'BOM deleted' });
});

const previewProduction = asyncHandler(async (req, res) => {
  const preview = await bomService.previewProduction(req.body);
  sendSuccess(res, { message: 'BOM production preview', data: preview });
});

const confirmProduction = asyncHandler(async (req, res) => {
  const production = await bomService.confirmProduction(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'BOM production confirmed', data: production });
});

const listProductions = asyncHandler(async (req, res) => {
  const result = await bomService.listProductions(req.query);
  sendSuccess(res, { message: 'BOM productions fetched', data: result.items, meta: result });
});

const getProductionById = asyncHandler(async (req, res) => {
  const production = await bomService.getProductionById(req.params.id);
  sendSuccess(res, { message: 'BOM production fetched', data: production });
});

module.exports = {
  listBoms,
  getBomById,
  createBom,
  updateBom,
  removeBom,
  previewProduction,
  confirmProduction,
  listProductions,
  getProductionById,
};
