const { ROLES, ADMIN_TYPES, JOB_ROLES, PERMISSION_KEYS } = require('../config/constants');

const PLATFORM_OWNER_EMAILS = [
  'gauravjain@atlantatelecables.com',
  'gauravjain@gmail.com',
  'mansi@gmail.com',
];

const APP_PERMISSION_SETS = {
  complaints: ['complaints', 'dashboard'],
  attendance: ['attendance', 'salespersonTracking', 'customers'],
  projects: ['projects', 'reports', 'cadDrawing', 'claimApprovals', 'dashboard'],
  tenders: ['tenders', 'tenderWhatsappAlerts', 'dashboard'],
  billing: ['billing', 'quotations', 'proformaInvoices', 'deliveryChallans'],
  financialDocuments: ['financialDocuments'],
  inspections: ['inspections'],
  accounts: ['accounts', 'bgWhatsappAlerts'],
  atlantaPayments: ['atlantaPayments'],
  shipping: ['shipping'],
  importControl: ['importControl'],
};

function isPlatformOwner(user) {
  return PLATFORM_OWNER_EMAILS.includes(String(user?.email || '').toLowerCase());
}

function adminTypeForApp(appAccess) {
  if (appAccess === 'complaints') return ADMIN_TYPES.COMPLAINT_COORDINATOR;
  if (appAccess === 'attendance') return ADMIN_TYPES.SALES_COORDINATOR;
  if (appAccess === 'tenders') return ADMIN_TYPES.TENDER_COORDINATOR;
  return ADMIN_TYPES.GENERAL_ADMIN;
}

function permissionsForApp(appAccess, grantAll = false) {
  if (grantAll || appAccess === 'ALL') {
    return PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }
  const allowed = new Set(APP_PERMISSION_SETS[appAccess] || []);
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = allowed.has(key);
    return acc;
  }, {});
}

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

function isLockedSuperAdmin(user) {
  return user?.adminType === ADMIN_TYPES.SUPER_ADMIN;
}

function isPasswordProtectedAdmin(user) {
  return user?.adminType === ADMIN_TYPES.SUPER_ADMIN || Boolean(user?.appSuperAdmin);
}

function canSetPassword(actor, target) {
  if (!actor || !target) return false;
  if (String(actor._id) === String(target._id)) return true;
  if (isPlatformOwner(actor)) return true;
  if (isPasswordProtectedAdmin(target)) return false;
  return true;
}

function permissionFlags(user) {
  return user?.permissions?._doc || user?.permissions || {};
}

function actorHasApp(user, appAccess) {
  if (!user || !appAccess) return false;
  if (isPlatformOwner(user) || isSuperAdmin(user)) return true;
  if (user.role !== ROLES.ADMIN) return false;
  const perm = permissionFlags(user);
  if (perm[appAccess] === true) return true;
  if (appAccess === 'attendance' && perm.salespersonTracking === true) return true;
  return false;
}

function defaultAdminPermissions(adminType) {
  if (adminType === ADMIN_TYPES.SALES_COORDINATOR) {
    return { salespersonTracking: true, customers: true, attendance: true };
  }
  if (adminType === ADMIN_TYPES.TENDER_COORDINATOR) {
    return { tenders: true, tenderWhatsappAlerts: true, dashboard: true, salespersonTracking: false, customers: false, attendance: false };
  }
  if (adminType === ADMIN_TYPES.COMPLAINT_COORDINATOR) {
    return { complaints: true, dashboard: true, salespersonTracking: false, customers: false, attendance: false };
  }
  return {};
}

function defaultUserPermissions(jobRole, appAccess) {
  if (appAccess === 'COMPLAINTS' || jobRole === 'FIELD_ENGINEER') {
    return { complaints: true, projects: false, attendance: false, salespersonTracking: false };
  }
  if (appAccess === 'ATTENDANCE' || jobRole === 'SALESPERSON') {
    return { attendance: true, salespersonTracking: true, customers: true, complaints: false };
  }
  if (appAccess === 'PROJECTS' || jobRole === 'INSTALLER') {
    return { projects: true, reports: true, cadDrawing: true, complaints: false, attendance: false };
  }
  return { complaints: true, projects: true };
}

module.exports = {
  isSuperAdmin,
  isLockedSuperAdmin,
  isPlatformOwner,
  canSetPassword,
  actorHasApp,
  isSalesperson,
  defaultAdminPermissions,
  defaultUserPermissions,
  adminTypeForApp,
  permissionsForApp,
  PLATFORM_OWNER_EMAILS,
};
