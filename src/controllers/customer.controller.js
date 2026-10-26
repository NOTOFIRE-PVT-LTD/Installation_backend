const customerService = require('../services/customer.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await customerService.list(req.query, req.user);
  sendSuccess(res, { message: 'Customers fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const customer = await customerService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Customer fetched', data: customer });
});

const create = asyncHandler(async (req, res) => {
  const customer = await customerService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Customer created', data: customer });
});

const update = asyncHandler(async (req, res) => {
  const customer = await customerService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Customer updated', data: customer });
});

const remove = asyncHandler(async (req, res) => {
  await customerService.remove(req.params.id);
  sendSuccess(res, { message: 'Customer deleted' });
});

module.exports = { list, getById, create, update, remove };
