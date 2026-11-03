const permissionRepository = require('../repositories/permission.repository');
const { PERMISSION_KEYS, ROLES, ADMIN_TYPES } = require('../config/constants');

// These modules are opt-in for every admin except the Super Admin. A missing flag means
// "no access" rather than the usual "newly added module, allow by default".
const OPT_IN_ADMIN_KEYS = ['complaints', 'shipping', 'importControl'];

const DEFAULT_INSTALLER_MODULES = ['projects', 'reports', 'cadDrawing', 'customers', 'attendance'];
const INSTALLER_PERMISSION_KEYS = [
  'projects',
  'reports',
  'cadDrawing',
  'customers',
  'attendance',
  'complaints',
  'atlantaPayments',
  'atlantaPaymentsOwnOnly',
  'shipping',
  'importControl',
];

function serializePermissions(user) {
  if (user.role === ROLES.ADMIN) {
    const isSuperAdmin = user.adminType === ADMIN_TYPES.SUPER_ADMIN;
    // Super Admin always gets every module — even if permissions doc is missing.
    if (isSuperAdmin) {
      return PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
    }
    if (!user.permissions) return null;
    const perm = user.permissions._doc || user.permissions;
    return PERMISSION_KEYS.reduce((acc, key) => {
      if (OPT_IN_ADMIN_KEYS.includes(key)) {
        acc[key] = Boolean(perm[key]);
      } else {
        acc[key] = perm[key] == null ? true : Boolean(perm[key]);
      }
      return acc;
    }, {});
  }

  // Installers default to full access for their workspace modules until an Admin explicitly
  // restricts them. Modules like atlantaPayments default to false unless explicitly granted.
  if (!user.permissions) return DEFAULT_INSTALLER_MODULES.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  const perm = user.permissions._doc || user.permissions;
  return INSTALLER_PERMISSION_KEYS.reduce((acc, key) => {
    if (DEFAULT_INSTALLER_MODULES.includes(key)) {
      acc[key] = perm[key] !== false;
    } else {
      acc[key] = Boolean(perm[key]);
    }
    return acc;
  }, {});
}

async function createDefaultPermissions(userId, { grantAll = false, actorId = null, keys = PERMISSION_KEYS } = {}) {
  const data = keys.reduce((acc, key) => {
    acc[key] = grantAll;
    return acc;
  }, {});
  return permissionRepository.create({
    user: userId,
    ...data,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

async function updatePermissions(userId, updates, actorId, keys = PERMISSION_KEYS) {
  const filtered = keys.reduce((acc, key) => {
    if (typeof updates[key] === 'boolean') acc[key] = updates[key];
    return acc;
  }, {});

  const permissionDoc = await permissionRepository.findByUser(userId);
  if (!permissionDoc) {
    const doc = await createDefaultPermissions(userId, { actorId, keys });
    return permissionRepository.updateById(doc._id, { ...filtered, updatedBy: actorId });
  }

  return permissionRepository.updateById(permissionDoc._id, { ...filtered, updatedBy: actorId });
}

module.exports = { serializePermissions, createDefaultPermissions, updatePermissions, INSTALLER_PERMISSION_KEYS };
