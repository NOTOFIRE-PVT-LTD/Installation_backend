const { sanitizeProjectForUser } = require('./project.sanitizeProjectForUser');
const { list, getById, create, update } = require('./project.listAndgetByIdAndcreateAndupdate');
const { remove, listAllForDropdown, getApprovalsQueue } = require('./project.removeAndlistAllForDropdownAndgetApprovalsQueue');
const { addStation } = require('./project.addStation');
const { updateStation } = require('./project.updateStation');
const { removeStation, submitStationClaim, approveStationClaim, rejectStationClaim, markStationPaid } = require('./project.removeStationAndsubmitStationClaimAndapproveStationClaimAndrejectStationClaimAndmarkStationPaid');
const { listInstallerOptions, addDailyReport, removeDailyReport, addStationDailyReport, removeStationDailyReport } = require('./project.listInstallerOptionsAndaddDailyReportAndremoveDailyReportAndaddStationDailyReportAndremoveStationDailyReport');

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  sanitizeProjectForUser,
  listAllForDropdown,
  listInstallerOptions,
  getApprovalsQueue,
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
