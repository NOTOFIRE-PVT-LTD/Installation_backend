const { getStats, getProjectProgress } = require('./dashboard.getStatsAndgetProjectProgress');
const { getProjectsOverview, getDailyFeed, getRecentReports, getRecentActivity, getMaterialStatusOverview } = require('./dashboard.getProjectsOverviewAndgetDailyFeedAndgetRecentReportsAndgetRecentActivityAndgetMaterialStatusOverview');

module.exports = {
  getStats,
  getProjectProgress,
  getProjectsOverview,
  getDailyFeed,
  getRecentReports,
  getRecentActivity,
  getMaterialStatusOverview,
};
