const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { resolvePortalAccess, accessCount } = require('../utils/portalAccess');
const { mintCentralSsoCode } = require('../utils/centralSso');
const { listPnlDirectoryUsers } = require('../utils/pnlDirectory');

function pnlPublicUrl() {
  return String(process.env.PNL_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function leadTrackPublicUrl() {
  return String(
    process.env.LEADTRACK_PUBLIC_URL || 'http://localhost:3010',
  ).replace(/\/$/, '');
}

function mapLeadTrackClaims(userDoc) {
  const admin =
    userDoc.role === 'Admin' ||
    userDoc.adminType === 'SUPER_ADMIN' ||
    userDoc.adminType === 'GENERAL_ADMIN';
  if (admin) return { accountRole: 'admin', designations: [] };
  const tag = String(userDoc.company || '');
  if (tag.includes('technical_staff')) {
    return { accountRole: 'user', designations: ['technical_staff'] };
  }
  return { accountRole: 'user', designations: ['telecaller'] };
}

/** Server-to-server: mirror LeadTrack CRM users into Centralisation login. */
async function upsertLeadTrackPortalUser({ email, name, password, accountRole, designations }) {
  const e = String(email || '').toLowerCase().trim();
  if (!e || !password || String(password).length < 6) {
    throw new ApiError(400, 'Email and password (6+) required');
  }
  const isAdmin = accountRole === 'admin';
  const des = Array.isArray(designations) ? designations : [];
  const company = isAdmin
    ? 'leadtrack:admin'
    : des.includes('technical_staff')
      ? 'leadtrack:technical_staff'
      : 'leadtrack:telecaller';
  let user = await User.findOne({ email: e }).select('+password');
  if (!user) {
    user = new User({
      name: name || e.split('@')[0],
      email: e,
      password,
      role: isAdmin ? 'Admin' : 'User',
      portalSource: 'leadtrack',
      company,
      jobRole: 'SALESPERSON',
      status: 'active',
    });
  } else {
    user.name = name || user.name;
    user.password = password;
    user.role = isAdmin ? 'Admin' : 'User';
    user.portalSource = 'leadtrack';
    user.company = company;
    user.status = 'active';
  }
  await user.save();
  return { id: String(user._id), email: user.email };
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

/** Mint P&L SSO URL from user document (re-checking portalSource if unset). */
async function openPnlApp(userDoc) {
  const email = userDoc?.email;
  if (!email || userDoc.status === 'inactive') {
    throw new ApiError(401, 'User inactive or missing');
  }
  let portalSource = userDoc.portalSource;
  if (!portalSource && userDoc._id) {
    const raw = await User.findById(userDoc._id).select('portalSource').lean();
    portalSource = raw?.portalSource;
  }
  const access = resolvePortalAccess(email, {
    portalSource,
    adminType: userDoc.adminType,
  });
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

/** Mint LeadTrack SSO URL — Centralisation login only; no LeadTrack signup. */
async function openLeadTrackApp(userDoc) {
  const email = userDoc?.email;
  if (!email || userDoc.status === 'inactive') {
    throw new ApiError(401, 'User inactive or missing');
  }
  const access = resolvePortalAccess(email, {
    portalSource: userDoc.portalSource,
    adminType: userDoc.adminType,
  });
  if (!access.leadtrack && !access.workspace) {
    throw new ApiError(403, 'No LeadTrack access');
  }
  const mapped = mapLeadTrackClaims(userDoc);
  const code = mintCentralSsoCode({
    email,
    name: userDoc.name || null,
    app: 'leadtrack',
    accountRole: mapped.accountRole,
    designations: mapped.designations,
  });
  return {
    url: `${leadTrackPublicUrl()}/api/sso/consume?code=${encodeURIComponent(code)}`,
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
      // P&L DB rows are P&L-only unless also a real Workspace mongo user above.
      portalSource: 'pnl',
    });
  });

  return Array.from(byEmail.values()).sort((a, b) =>
    String(a.name || a.email).localeCompare(String(b.name || b.email))
  );
}

module.exports = {
  getPortalSession,
  openPnlApp,
  openLeadTrackApp,
  listPortalDirectory,
  upsertLeadTrackPortalUser,
  pnlPublicUrl,
  leadTrackPublicUrl,
};
