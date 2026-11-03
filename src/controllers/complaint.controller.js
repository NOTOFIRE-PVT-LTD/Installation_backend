const complaintService = require('../services/complaint.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const publicCreate = asyncHandler(async (req, res) => {
  const complaint = await complaintService.createPublic(req.body, req.files || []);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Complaint submitted successfully',
    data: {
      _id: complaint._id,
      ticketNumber: complaint.ticketNo,
      ticketNo: complaint.ticketNo,
      status: complaint.status,
      createdAt: complaint.createdAt,
    },
  });
});

const publicTrack = asyncHandler(async (req, res) => {
  const ticketNumber = req.query.ticket || req.query.ticketId || req.query.ticketNo;
  const verification = req.query.verification;
  const data = await complaintService.publicTrack({ ticketNumber, verification });
  sendSuccess(res, { message: 'Complaint status retrieved', data });
});

const list = asyncHandler(async (req, res) => {
  const result = await complaintService.list(req.query, req.user);
  sendSuccess(res, {
    message: 'Complaints fetched successfully',
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

const getById = asyncHandler(async (req, res) => {
  const complaint = await complaintService.getById(req.params.id);
  sendSuccess(res, { message: 'Complaint detail fetched', data: complaint });
});

const dashboardMetrics = asyncHandler(async (req, res) => {
  const data = await complaintService.getDashboardMetrics(req.user);
  sendSuccess(res, { message: 'Complaint dashboard metrics fetched', data });
});

const checkDuplicate = asyncHandler(async (req, res) => {
  const { phone, serialNumber } = req.query;
  const data = await complaintService.checkDuplicate({ phone, serialNumber });
  sendSuccess(res, { message: 'Duplicate check complete', data });
});

const assignees = asyncHandler(async (req, res) => {
  const data = await complaintService.getAssignees();
  sendSuccess(res, { message: 'Complaint assignees fetched', data });
});

const createInternal = asyncHandler(async (req, res) => {
  const complaint = await complaintService.createInternal(req.body, req.user);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Internal complaint intake created successfully',
    data: complaint,
  });
});

const acknowledge = asyncHandler(async (req, res) => {
  const complaint = await complaintService.acknowledge(req.params.id, req.user);
  sendSuccess(res, { message: 'Complaint acknowledged', data: complaint });
});

const assign = asyncHandler(async (req, res) => {
  const complaint = await complaintService.assign(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Complaint assigned successfully', data: complaint });
});

const updateStatus = asyncHandler(async (req, res) => {
  const complaint = await complaintService.updateStatus(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Complaint status updated', data: complaint });
});

const addWorkLog = asyncHandler(async (req, res) => {
  const complaint = await complaintService.addWorkLog(req.params.id, req.body, req.user);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Investigation work log added',
    data: complaint,
  });
});

const resolve = asyncHandler(async (req, res) => {
  const complaint = await complaintService.resolve(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Complaint resolved successfully', data: complaint });
});

const reopen = asyncHandler(async (req, res) => {
  const complaint = await complaintService.reopen(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Complaint reopened successfully', data: complaint });
});

const addComment = asyncHandler(async (req, res) => {
  const complaint = await complaintService.addComment(req.params.id, req.body, req.user);
  sendSuccess(res, {
    statusCode: 201,
    message: 'Note added successfully',
    data: complaint,
  });
});

const update = asyncHandler(async (req, res) => {
  const complaint = await complaintService.update(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Complaint updated', data: complaint });
});

module.exports = {
  publicCreate,
  publicTrack,
  list,
  getById,
  dashboardMetrics,
  checkDuplicate,
  assignees,
  createInternal,
  acknowledge,
  assign,
  updateStatus,
  addWorkLog,
  resolve,
  reopen,
  addComment,
  update,
};
