const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const stats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getStats(req.user);
  sendSuccess(res, { message: 'Dashboard stats fetched', data });
});

const projectProgress = asyncHandler(async (req, res) => {
  const data = await dashboardService.getProjectProgress();
  sendSuccess(res, { message: 'Project progress fetched', data });
});

const projectsOverview = asyncHandler(async (req, res) => {
  const data = await dashboardService.getProjectsOverview(req.query.limit, req.user);
  sendSuccess(res, { message: 'Projects overview fetched', data });
});

const dailyFeed = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDailyFeed(req.query.limit, req.user);
  sendSuccess(res, { message: 'Daily feed fetched', data });
});

const recentReports = asyncHandler(async (req, res) => {
  const data = await dashboardService.getRecentReports(req.query.limit);
  sendSuccess(res, { message: 'Recent reports fetched', data });
});

const recentActivity = asyncHandler(async (req, res) => {
  const data = await dashboardService.getRecentActivity(req.query.limit);
  sendSuccess(res, { message: 'Recent activity fetched', data });
});

module.exports = { stats, projectProgress, projectsOverview, dailyFeed, recentReports, recentActivity };
