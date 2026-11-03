const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { ADMIN_TYPES } = require('../config/constants');
const companionService = require('../services/companion.service');

function isSuperAdmin(user) {
  const email = String(user?.email || '').toLowerCase();
  return (
    user?.adminType === ADMIN_TYPES.SUPER_ADMIN ||
    email === 'admin@nfsite.com' ||
    email === 'super.admin@demo.local'
  );
}

function permissionFlags(user) {
  return user?.permissions?._doc || user?.permissions || {};
}

const createSession = asyncHandler(async (req, res) => {
  const app = String(req.body?.app || '').toLowerCase();
  if (app !== 'shipping' && app !== 'import') {
    throw new ApiError(400, 'App must be shipping or import');
  }

  const superAdmin = isSuperAdmin(req.user);
  const perm = permissionFlags(req.user);
  const allowed =
    superAdmin || (app === 'shipping' ? Boolean(perm.shipping) : Boolean(perm.importControl));
  if (!allowed) throw new ApiError(403, 'You do not have access to this app');

  const session = await companionService.openSession(app, {
    email: String(req.user.email || '').toLowerCase(),
    name: req.user.name || req.user.email,
    asAdmin: superAdmin,
  });
  return sendSuccess(res, { data: session });
});

module.exports = { createSession };
