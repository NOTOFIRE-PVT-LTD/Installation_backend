const ROLES = Object.freeze({
  ADMIN: 'Admin',
  USER: 'User',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const REPORT_STATUS = Object.freeze({
  PENDING: 'Pending',
  VERIFIED: 'Verified',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAID: 'Paid',
});

const PAYMENT_METHOD = Object.freeze({
  INSTALLER: 'Installer',
  CONTRACTOR: 'Contractor',
});

const CLAIM_STATUS = Object.freeze({
  NOT_SUBMITTED: 'Not Submitted',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
});

const SITE_TYPES = Object.freeze(['Station', 'IBH', 'Auto Hut', 'LC Gate', 'Telecom Exchange', 'Building']);

const DEFAULT_BONUS_PERCENT = 5;

const PERMISSION_KEYS = Object.freeze([
  'dashboard',
  'users',
  'projects',
  'reports',
  'payments',
  'numbers',
  'cadDrawing',
  'claimApprovals',
  'tenders',
  'tenderWhatsappAlerts',
  'inspections',
  'financialDocuments',
  'bgWhatsappAlerts',
]);

const INSPECTION_STATUS = Object.freeze({
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
});

const LOA_TYPES = Object.freeze({
  NOTOFIRE: 'Notofire',
  THIRD_PARTY: 'Third Party',
});

const NUMBER_CATEGORIES = Object.freeze({
  GOVERNMENT_OFFICIAL: 'Government Official',
  INSTALLER: 'Installer',
  MANAGEMENT: 'Management',
});

module.exports = {
  ROLES,
  USER_STATUS,
  REPORT_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  CLAIM_STATUS,
  SITE_TYPES,
  DEFAULT_BONUS_PERCENT,
  PERMISSION_KEYS,
  INSPECTION_STATUS,
  LOA_TYPES,
  NUMBER_CATEGORIES,
};
