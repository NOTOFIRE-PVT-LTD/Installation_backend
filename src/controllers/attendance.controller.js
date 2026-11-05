const attendanceService = require('../services/attendance.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await attendanceService.list(req.query, req.user);
  sendSuccess(res, { message: 'Attendance fetched', data: result.items, meta: result });
});

const today = asyncHandler(async (req, res) => {
  const result = await attendanceService.today(req.user);
  sendSuccess(res, { message: 'Today attendance fetched', data: result });
});

const punch = asyncHandler(async (req, res) => {
  const record = await attendanceService.punch(req.body, req.file, req.user);
  const kind = String(req.body.kind || '').toUpperCase();
  const message =
    kind === 'IN' ? 'Attendance marked. Your visit plan is now available.' : 'Punched out';
  sendSuccess(res, { message, data: record });
});

const summary = asyncHandler(async (req, res) => {
  const result = await attendanceService.summary(req.user);
  sendSuccess(res, { message: 'Attendance summary fetched', data: result });
});

const requestCorrection = asyncHandler(async (req, res) => {
  const correction = await attendanceService.requestCorrection(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Submitted for admin approval', data: correction });
});

const listCorrections = asyncHandler(async (req, res) => {
  const result = await attendanceService.listCorrections(req.query, req.user);
  sendSuccess(res, { message: 'Corrections fetched', data: result.items, meta: result });
});

const reviewCorrection = asyncHandler(async (req, res) => {
  const correction = await attendanceService.reviewCorrection(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Correction updated', data: correction });
});

module.exports = { list, today, punch, summary, requestCorrection, listCorrections, reviewCorrection };
