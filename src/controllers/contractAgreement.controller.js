const contractAgreementService = require('../services/contractAgreement.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await contractAgreementService.list(req.query);
  sendSuccess(res, { message: 'Contract agreements fetched', data: result.items, meta: result });
});

const options = asyncHandler(async (req, res) => {
  const items = await contractAgreementService.options();
  sendSuccess(res, { message: 'Contract agreement options fetched', data: items });
});

const getById = asyncHandler(async (req, res) => {
  const doc = await contractAgreementService.getById(req.params.id);
  sendSuccess(res, { message: 'Contract agreement fetched', data: doc });
});

const create = asyncHandler(async (req, res) => {
  const doc = await contractAgreementService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Contract agreement created', data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await contractAgreementService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Contract agreement updated', data: doc });
});

const remove = asyncHandler(async (req, res) => {
  await contractAgreementService.remove(req.params.id);
  sendSuccess(res, { message: 'Contract agreement deleted' });
});

module.exports = { list, options, getById, create, update, remove };
