const projectService = require('../services/project.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

function projectResponse(project, user) {
  return projectService.sanitizeProjectForUser(project, user);
}

const list = asyncHandler(async (req, res) => {
  const result = await projectService.list(req.query, req.user);
  sendSuccess(res, { message: 'Projects fetched', data: result.items, meta: result });
});

const options = asyncHandler(async (req, res) => {
  const projects = await projectService.listAllForDropdown(req.user);
  sendSuccess(res, { message: 'Projects fetched', data: projects });
});

const approvalsQueue = asyncHandler(async (req, res) => {
  const queue = await projectService.getApprovalsQueue();
  sendSuccess(res, { message: 'Approvals queue fetched', data: queue });
});

const getById = asyncHandler(async (req, res) => {
  const project = await projectService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Project fetched', data: project });
});

const create = asyncHandler(async (req, res) => {
  const project = await projectService.create(req.body, req.files, req.user._id, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Project created', data: project });
});

const update = asyncHandler(async (req, res) => {
  const project = await projectService.update(req.params.id, req.body, req.files, req.user._id, req.user);
  sendSuccess(res, { message: 'Project updated', data: project });
});

const remove = asyncHandler(async (req, res) => {
  await projectService.remove(req.params.id);
  sendSuccess(res, { message: 'Project deleted' });
});

const addStation = asyncHandler(async (req, res) => {
  const project = await projectService.addStation(req.params.id, req.body, req.files, req.user._id, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Station added', data: projectResponse(project, req.user) });
});

const updateStation = asyncHandler(async (req, res) => {
  const project = await projectService.updateStation(
    req.params.id,
    req.params.stationId,
    req.body,
    req.files,
    req.body.removePhotoIds,
    req.body.removeCadFileIds,
    req.user._id,
    req.user
  );
  sendSuccess(res, { message: 'Station updated', data: projectResponse(project, req.user) });
});

const removeStation = asyncHandler(async (req, res) => {
  const project = await projectService.removeStation(req.params.id, req.params.stationId, req.user);
  sendSuccess(res, { message: 'Station deleted', data: projectResponse(project, req.user) });
});

const submitStationClaim = asyncHandler(async (req, res) => {
  const project = await projectService.submitStationClaim(req.params.id, req.params.stationId, req.user._id, req.user);
  sendSuccess(res, { message: 'Claim submitted for approval', data: projectResponse(project, req.user) });
});

const approveStationClaim = asyncHandler(async (req, res) => {
  const project = await projectService.approveStationClaim(req.params.id, req.params.stationId, req.user._id);
  sendSuccess(res, { message: 'Claim approved', data: projectResponse(project, req.user) });
});

const rejectStationClaim = asyncHandler(async (req, res) => {
  const project = await projectService.rejectStationClaim(req.params.id, req.params.stationId, req.body.reason || 'Not specified', req.user._id);
  sendSuccess(res, { message: 'Claim rejected', data: projectResponse(project, req.user) });
});

const markStationPaid = asyncHandler(async (req, res) => {
  const project = await projectService.markStationPaid(req.params.id, req.params.stationId, req.user._id);
  sendSuccess(res, { message: 'Payment marked as released', data: projectResponse(project, req.user) });
});

const addDailyReport = asyncHandler(async (req, res) => {
  const project = await projectService.addDailyReport(req.params.id, req.body, req.files, req.user._id, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Daily report added', data: projectResponse(project, req.user) });
});

const removeDailyReport = asyncHandler(async (req, res) => {
  const project = await projectService.removeDailyReport(req.params.id, req.params.reportId, req.user);
  sendSuccess(res, { message: 'Daily report deleted', data: projectResponse(project, req.user) });
});

const addStationDailyReport = asyncHandler(async (req, res) => {
  const project = await projectService.addStationDailyReport(
    req.params.id,
    req.params.stationId,
    req.body,
    req.files,
    req.user._id,
    req.user
  );
  sendSuccess(res, { statusCode: 201, message: 'Station daily report added', data: projectResponse(project, req.user) });
});

const removeStationDailyReport = asyncHandler(async (req, res) => {
  const project = await projectService.removeStationDailyReport(
    req.params.id,
    req.params.stationId,
    req.params.reportId,
    req.user
  );
  sendSuccess(res, { message: 'Station daily report deleted', data: projectResponse(project, req.user) });
});

module.exports = {
  list,
  options,
  getById,
  create,
  update,
  remove,
  approvalsQueue,
  addStation,
  updateStation,
  removeStation,
  submitStationClaim,
  approveStationClaim,
  rejectStationClaim,
  markStationPaid,
  addDailyReport,
  removeDailyReport,
  addStationDailyReport,
  removeStationDailyReport,
};
