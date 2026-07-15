const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/constants');

function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    if (req.user.role !== ROLES.ADMIN) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }

    const permissions = req.user.permissions;
    if (!permissions || !permissions[key]) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }

    next();
  };
}

// Admins are gated by their permission flag. The given non-Admin roles are let through by
// default (no Permission doc = full access, preserving pre-existing installer behavior), but
// once an Admin explicitly sets a flag to false for that installer, it's enforced here too.
function requirePermissionOrRole(key, ...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));

    if (req.user.role !== ROLES.ADMIN) {
      if (!allowedRoles.includes(req.user.role)) {
        return next(new ApiError(403, 'You do not have permission to perform this action'));
      }
      const installerPermissions = req.user.permissions;
      if (installerPermissions && installerPermissions[key] === false) {
        return next(new ApiError(403, `You do not have the "${key}" permission`));
      }
      return next();
    }

    const permissions = req.user.permissions;
    if (!permissions || !permissions[key]) {
      return next(new ApiError(403, `You do not have the "${key}" permission`));
    }
    next();
  };
}

module.exports = { requirePermission, requirePermissionOrRole };
