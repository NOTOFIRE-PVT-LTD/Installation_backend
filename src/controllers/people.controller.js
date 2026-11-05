const peopleService = require('../services/people.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await peopleService.list(req.query);
  sendSuccess(res, { message: 'Salespeople fetched', data: result.items, meta: result });
});

const create = asyncHandler(async (req, res) => {
  const person = await peopleService.create(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Salesperson created', data: person });
});

const update = asyncHandler(async (req, res) => {
  const person = await peopleService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Salesperson updated', data: person });
});

const updateStatus = asyncHandler(async (req, res) => {
  const person = await peopleService.updateStatus(req.params.id, req.body.status, req.user._id);
  sendSuccess(res, { message: 'Status updated', data: person });
});

module.exports = { list, create, update, updateStatus };
