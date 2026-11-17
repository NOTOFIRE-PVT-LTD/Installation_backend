const portalService = require('../services/portal.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const me = asyncHandler(async (req, res) => {
  const data = await portalService.getPortalSession(req.user._id);
  sendSuccess(res, { message: 'OK', data });
});

const openPnl = asyncHandler(async (req, res) => {
  const data = await portalService.openPnlApp(req.user._id);
  sendSuccess(res, { message: 'OK', data });
});

const directory = asyncHandler(async (req, res) => {
  const users = await portalService.listPortalDirectory();
  sendSuccess(res, { message: 'OK', data: { users } });
});

module.exports = { me, openPnl, directory };
