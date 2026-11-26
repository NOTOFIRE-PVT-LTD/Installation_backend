const portalService = require('../services/portal.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');

const me = asyncHandler(async (req, res) => {
  const data = await portalService.getPortalSession(req.user._id);
  sendSuccess(res, { message: 'OK', data });
});

const openPnl = asyncHandler(async (req, res) => {
  const data = await portalService.openPnlApp(req.user);
  sendSuccess(res, { message: 'OK', data });
});

const openLeadTrack = asyncHandler(async (req, res) => {
  const data = await portalService.openLeadTrackApp(req.user);
  sendSuccess(res, { message: 'OK', data });
});

const directory = asyncHandler(async (req, res) => {
  const users = await portalService.listPortalDirectory();
  sendSuccess(res, { message: 'OK', data: { users } });
});

/** LeadTrack server → Centralisation user mirror (SSO_SECRET). */
const upsertLeadTrackUser = asyncHandler(async (req, res) => {
  const secret = req.headers['x-leadtrack-provision-secret'];
  if (!secret || secret !== process.env.SSO_SECRET) {
    throw new ApiError(401, 'Unauthorized');
  }
  const data = await portalService.upsertLeadTrackPortalUser(req.body || {});
  sendSuccess(res, { message: 'OK', data });
});

module.exports = { me, openPnl, openLeadTrack, directory, upsertLeadTrackUser };
