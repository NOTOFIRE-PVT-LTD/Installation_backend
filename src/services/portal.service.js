const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { resolvePortalAccess, accessCount } = require('../utils/portalAccess');
const { mintCentralSsoCode } = require('../utils/centralSso');
const { listPnlDirectoryUsers } = require('../utils/pnlDirectory');

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

function roleLabel(adminType, role) {
  if (adminType) return String(adminType).replace(/_/g, ' ');
  return role || null;
}

function accessForUser(user) {
  return resolvePortalAccess(user.email, {
    portalSource: user.portalSource,
    adminType: user.adminType,
  });
}

async function getPortalSession(userId) {
  const user = await User.findById(userId)
    .select('name email mobileNumber role adminType status portalSource')
    .lean();
  if (!user || user.status === 'inactive') {
    throw new ApiError(401, 'User inactive or missing');
  }
  const access = accessForUser(user);
  return {
    user: toPortalUser(user),
    access,
    accessCount: accessCount(access),
  };
}

/** Mint P&L SSO URL from the already-authenticated req.user (no extra DB read). */
function openPnlApp(userDoc) {
  const email = userDoc?.email;
  if (!email) throw new ApiError(401, 'User inactive or missing');
  if (userDoc.status === 'inactive') throw new ApiError(401, 'User inactive or missing');
  const access = accessForUser(userDoc);
  if (!access.pnl) throw new ApiError(403, 'No P&L access');
  const code = mintCentralSsoCode({
    email,
    name: userDoc.name || null,
    app: 'pnl',
  });
  return {
    url: `${pnlPublicUrl()}/api/sso/consume?code=${encodeURIComponent(code)}`,
  };
}

function upsertDirectoryRow(map, row) {
  const email = String(row.email || '').toLowerCase().trim();
  if (!email) return;
  const access = resolvePortalAccess(email, {
    portalSource: row.portalSource,
    adminType: row.adminType,
  });
  if (!access.pnl && !access.workspace) return;

  const existing = map.get(email);
  const apps = new Set(existing?.apps || []);
  if (access.workspace) apps.add('workspace');
  if (access.pnl) apps.add('pnl');
  if (!apps.size) return;

  map.set(email, {
    id: existing?.id || row.id,
    workspaceId: access.workspace
      ? row.workspaceId || existing?.workspaceId || null
      : null,
    name: row.name || existing?.name || null,
    email,
    phone: row.phone || existing?.phone || null,
    role: row.role || existing?.role || null,
    active: row.active !== false && (existing ? existing.active !== false : true),
    apps: Array.from(apps),
  });
}

async function listPortalDirectory() {
  const [wsUsers, pnlUsers] = await Promise.all([
    User.find({})
      .select('name email mobileNumber role adminType status portalSource')
      .sort({ name: 1 })
      .lean(),
    listPnlDirectoryUsers(),
  ]);

  const byEmail = new Map();

  wsUsers.forEach((u) => {
    upsertDirectoryRow(byEmail, {
      id: `ws-${u._id}`,
      workspaceId: String(u._id),
      email: u.email,
      name: u.name || null,
      phone: u.mobileNumber || null,
      role: roleLabel(u.adminType, u.role),
      active: u.status !== 'inactive',
      portalSource: u.portalSource,
      adminType: u.adminType,
    });
  });

  pnlUsers.forEach((u) => {
    upsertDirectoryRow(byEmail, {
      id: `pnl-${u.id}`,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      active: u.active,
    });
  });

  return Array.from(byEmail.values()).sort((a, b) =>
    String(a.name || a.email).localeCompare(String(b.name || b.email))
  );
}

module.exports = {
  getPortalSession,
  openPnlApp,
  listPortalDirectory,
  pnlPublicUrl,
};
