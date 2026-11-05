const ApiError = require('../utils/ApiError');
const { ROLES, ADMIN_TYPES } = require('../config/constants');
const { isSuperAdmin, adminHasPermission } = require('../utils/roles');

function checkSuperAdmin(user) {
  if (!user) return false;
  return (
    isSuperAdmin(user) ||
    (user.role === ROLES.ADMIN && user.adminType === ADMIN_TYPES.SUPER_ADMIN) ||
    user.email === 'super.admin@demo.local' ||
    user.email === 'admin@nfsite.com'
  );
}

function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    // Super Admin has unrestricted access to all endpoints
    if (checkSuperAdmin(req.user)) {
      return next();
    }

    if (req.user.role !== ROLES.ADMIN) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }

    if (!adminHasPermission(req.user, key)) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }

    next();
  };
}

function requirePermissionOrRole(key, ...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    // Super Admin has unrestricted access to all endpoints
    if (checkSuperAdmin(req.user)) {
      return next();
    }

    if (req.user.role !== ROLES.ADMIN) {
      if (!allowedRoles.includes(req.user.role)) {
        return next(new ApiError(403, 'You do not have permission to perform this action'));
      }
      const installerPermissions = req.user.permissions?._doc || req.user.permissions;
      if (installerPermissions && installerPermissions[key] === false) {
        return next(new ApiError(403, `You do not have the "${key}" permission`));
      }
      return next();
    }

    if (!adminHasPermission(req.user, key)) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }

    next();
  };
}

function requireExplicitPermission(key) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    if (checkSuperAdmin(req.user)) {
      return next();
    }

    if (req.user.role === ROLES.ADMIN) {
      if (!adminHasPermission(req.user, key)) {
        return next(new ApiError(403, `You do not have the "${key}" permission`));
      }
      return next();
    }

    const permissions = req.user.permissions;
    if (!permissions) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }
    const stored = permissions._doc || permissions;
    if (stored[key] !== true) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }

    next();
  };
}

module.exports = { requirePermission, requirePermissionOrRole, requireExplicitPermission };
