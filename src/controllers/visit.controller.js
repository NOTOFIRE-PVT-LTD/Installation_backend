const visitService = require('../services/visit.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await visitService.list(req.query, req.user);
  sendSuccess(res, { message: 'Visits fetched', data: result.items, meta: result });
});

const today = asyncHandler(async (req, res) => {
  const result = await visitService.todayPlan(req.user);
  sendSuccess(res, { message: 'Today visit plan fetched', data: result });
});

const getById = asyncHandler(async (req, res) => {
  const visit = await visitService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Visit fetched', data: visit });
});

const create = asyncHandler(async (req, res) => {
  const visit = await visitService.create(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Visit created', data: visit });
});

const proximity = asyncHandler(async (req, res) => {
  const result = await visitService.proximity(req.params.id, req.query, req.user);
  sendSuccess(res, { message: 'Proximity fetched', data: result });
});

const checkIn = asyncHandler(async (req, res) => {
  const visit = await visitService.checkIn(req.params.id, req.body, req.file, req.user);
  sendSuccess(res, { message: 'Checked in', data: visit });
});

const checkOut = asyncHandler(async (req, res) => {
  const visit = await visitService.checkOut(req.params.id, req.body, req.file, req.user);
  sendSuccess(res, { message: 'Visit completed', data: visit });
});

const reportMissed = asyncHandler(async (req, res) => {
  const visit = await visitService.reportMissed(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Submitted for admin approval', data: visit });
});

const listApprovals = asyncHandler(async (req, res) => {
  const result = await visitService.listApprovals(req.query, req.user);
  sendSuccess(res, { message: 'Approvals fetched', data: result.items, meta: result });
});

const reviewApproval = asyncHandler(async (req, res) => {
  const approval = await visitService.reviewApproval(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Approval updated', data: approval });
});

const getDay = asyncHandler(async (req, res) => {
  const result = await visitService.getDay(req.query, req.user);
  sendSuccess(res, { message: 'Day plan fetched', data: result });
});

const selectDay = asyncHandler(async (req, res) => {
  const result = await visitService.selectDay(req.body, req.user);
  sendSuccess(res, { message: "Today's visits selected", data: result });
});

const submitDay = asyncHandler(async (req, res) => {
  const result = await visitService.submitDay(req.user);
  sendSuccess(res, { message: 'Day submitted', data: result });
});

const dailySummary = asyncHandler(async (req, res) => {
  const result = await visitService.dailySummary(req.query, req.user);
  sendSuccess(res, { message: 'Daily visit summary fetched', data: result });
});

module.exports = {
  list,
  today,
  getById,
  create,
  proximity,
  checkIn,
  checkOut,
  reportMissed,
  listApprovals,
  reviewApproval,
  getDay,
  selectDay,
  submitDay,
  dailySummary,
};
