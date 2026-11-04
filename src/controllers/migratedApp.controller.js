const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const migratedAppService = require('../services/migratedApp.service');

const shippingDashboard = asyncHandler(async (req, res) => {
  const data = await migratedAppService.getShippingDashboard();
  return sendSuccess(res, { data });
});

const shippingTab = asyncHandler(async (req, res) => {
  const data = await migratedAppService.listTab('shipping', req.params.tab, req.query);
  return sendSuccess(res, { data });
});

const importDashboard = asyncHandler(async (req, res) => {
  const data = await migratedAppService.getImportDashboard();
  return sendSuccess(res, { data });
});

const importTab = asyncHandler(async (req, res) => {
  const data = await migratedAppService.listTab('import', req.params.tab, req.query);
  return sendSuccess(res, { data });
});

module.exports = {
  shippingDashboard,
  shippingTab,
  importDashboard,
  importTab,
};
