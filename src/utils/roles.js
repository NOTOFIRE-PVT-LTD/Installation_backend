const { ROLES, ADMIN_TYPES, JOB_ROLES } = require('../config/constants');

function isSuperAdmin(user) {
  if (user?.role !== ROLES.ADMIN) return false;
  if (user.adminType === ADMIN_TYPES.SUPER_ADMIN) return true;
  if (!user.adminType) {
    const perm = user.permissions?._doc || user.permissions;
    return Boolean(perm && perm.users !== false && perm.dashboard !== false);
  }
  return false;
}

function isSalesperson(user) {
  return user?.role === ROLES.USER && user.jobRole === JOB_ROLES.SALESPERSON;
}

function defaultAdminPermissions(adminType) {
  if (adminType === ADMIN_TYPES.SALES_COORDINATOR) {
    return { salespersonTracking: true, customers: true, attendance: true };
  }
  if (adminType === ADMIN_TYPES.TENDER_COORDINATOR) {
    return { tenders: true, tenderWhatsappAlerts: true, dashboard: true, salespersonTracking: false, customers: false, attendance: false };
  }
  return {};
}

module.exports = { isSuperAdmin, isSalesperson, defaultAdminPermissions };
