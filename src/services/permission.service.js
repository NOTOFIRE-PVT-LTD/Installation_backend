const permissionRepository = require('../repositories/permission.repository');
const { PERMISSION_KEYS, ROLES } = require('../config/constants');

const INSTALLER_PERMISSION_KEYS = ['projects', 'reports', 'cadDrawing'];

function serializePermissions(user) {
  if (user.role === ROLES.ADMIN) {
    if (!user.permissions) return null;
    const perm = user.permissions;
    return PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = Boolean(perm[key]);
      return acc;
    }, {});
  }

  // Installers default to full access for their workspace modules until an Admin explicitly
  // restricts them.
  if (!user.permissions) return INSTALLER_PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  const perm = user.permissions;
  return INSTALLER_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = perm[key] !== false;
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
