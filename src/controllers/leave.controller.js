const leaveService = require('../services/leave.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const create = asyncHandler(async (req, res) => {
  const leave = await leaveService.create(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Leave submitted for approval', data: leave });
});

const list = asyncHandler(async (req, res) => {
  const result = await leaveService.list(req.query, req.user);
  sendSuccess(res, { message: 'Leave requests fetched', data: result.items, meta: result });
});

const review = asyncHandler(async (req, res) => {
  const leave = await leaveService.review(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Leave updated', data: leave });
});

module.exports = { create, list, review };
