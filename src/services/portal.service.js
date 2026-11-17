const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { resolvePortalAccess, accessCount } = require('../utils/portalAccess');
const { mintCentralSsoCode } = require('../utils/centralSso');

function pnlPublicUrl() {
  return String(process.env.PNL_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function toPortalUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name || null,
    phone: user.mobileNumber || null,
    role: user.adminType || user.role || null,
  };
}

async function getPortalSession(userId) {
  const user = await User.findById(userId)
    .select('name email mobileNumber role adminType status')
    .lean();
  if (!user || user.status === 'inactive') {
    throw new ApiError(401, 'User inactive or missing');
  }
  const access = resolvePortalAccess(user.email);
  return {
    user: toPortalUser(user),
    access,
    accessCount: accessCount(access),
  };
}

async function openPnlApp(userId) {
  const session = await getPortalSession(userId);
  if (!session.access.pnl) {
    throw new ApiError(403, 'No P&L access');
  }
  const code = mintCentralSsoCode({
    email: session.user.email,
    name: session.user.name,
    app: 'pnl',
  });
  return {
    url: `${pnlPublicUrl()}/api/sso/consume?code=${encodeURIComponent(code)}`,
  };
}

async function listPortalDirectory() {
  const users = await User.find({})
    .select('name email mobileNumber role adminType status')
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({
    id: String(u._id),
    name: u.name || null,
    email: u.email,
    phone: u.mobileNumber || null,
    role: u.adminType || u.role || null,
    active: u.status !== 'inactive',
    app: 'workspace',
  }));
}

module.exports = {
  getPortalSession,
  openPnlApp,
  listPortalDirectory,
  pnlPublicUrl,
};
