const projectRepository = require('../repositories/project.repository');
const userRepository = require('../repositories/user.repository');
const uploadService = require('./upload.service');
const env = require('../config/env');
const whatsappNotificationService = require('./whatsappNotification.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { CLAIM_STATUS, DEFAULT_BONUS_PERCENT, ROLES, USER_STATUS } = require('../config/constants');

const ALLOWED_SORT_FIELDS = [
  'projectName',
  'installerName',
  'contractor',
  'railwayZone',
  'panelSerialNo',
  'installationStartDate',
  'installationEndDate',
  'dateOfCommissioning',
  'dateOfPayment',
  'balancePayment',
  'createdAt',
];

const TEXT_FIELDS = [
  'projectName',
  'contractor',
  'railwayZone',
  'serialType',
  'panelSerialStart',
  'panelSerialEnd',
  'panelSerialNo',
  'projectType',
  'invoiceNoDateSupply',
  'installationInvoice',
  'loaNo',
  'workName',
  'reasonForDelay',
  'supervisorName',
];
const NUMBER_FIELDS = [
  'cableUsed',
  'asdUsed',
  'lhdUsed',
  'noOfDevices',
  'amountFixWithContractor',
  'amountFixWithInstaller',
  'amountReceivedFromContractor',
  'amountPaidToInstaller',
  'balancePayment',
  'totalInstallationAmount',
];
const DATE_FIELDS = ['installationStartDate', 'installationEndDate', 'dateOfCommissioning', 'dateOfPayment', 'loaDate', 'dateOfCompletionLOA', 'targetDate'];
const JSON_FIELDS = ['totalUnits', 'loaItems', 'railwayOfficers', 'additionalOfficers', 'notofireContact', 'installerRatings'];
const SINGLE_DOCUMENT_FIELDS = ['checklistPdf', 'installationInvoiceDoc', 'supplyInvoiceDoc', 'installationPoDoc'];

function parseJSONField(raw) {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function pickFields(data, { isAdmin = false } = {}) {
  const updates = {};
  TEXT_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });
  NUMBER_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });
  DATE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field] || null;
  });
  JSON_FIELDS.forEach((field) => {
    if (field === 'installerRatings' && !isAdmin) return;
    if (data[field] !== undefined) {
      const parsed = parseJSONField(data[field]);
      if (parsed !== undefined) {
        if (field === 'installerRatings') {
          updates.installerRatings = {
            timelyCompletion:
              parsed.timelyCompletion === '' || parsed.timelyCompletion == null ? null : Number(parsed.timelyCompletion),
            qualityOfWork:
              parsed.qualityOfWork === '' || parsed.qualityOfWork == null ? null : Number(parsed.qualityOfWork),
            complaintsOrIssues: parsed.complaintsOrIssues || '',
          };
        } else {
          updates[field] = parsed;
        }
      }
    }
  });
  if (data.checklistReceived !== undefined) updates.checklistReceived = data.checklistReceived;
  if (data.bonusPercentOverride !== undefined) {
    updates.bonusPercentOverride = data.bonusPercentOverride === '' ? null : Number(data.bonusPercentOverride);
  }
  return updates;
}

function applyProjectScopeFilter(filter, user) {
  if (user?.role === ROLES.USER) {
    filter.$or = [{ assignedInstallers: user._id }, { assignedInstaller: user._id }];
  }
  return filter;
}

function buildPanelSerialNo({ serialType, panelSerialStart, panelSerialEnd, panelSerialNo, projectName }) {
  const type = serialType || 'LHS/ASD';
  const start = String(panelSerialStart || '').trim();
  const end = String(panelSerialEnd || '').trim();

  if (type === 'LHS/ASD' || type === 'LHS' || type === 'AHD') {
    if (start) return type === 'LHS/ASD' ? `LHS/ASD: ${start}` : `${type}: ${start}`;
  } else if (type === 'ALL' || type === 'Others') {
    const name = String(projectName || '').trim() || String(panelSerialNo || '').trim() || `ALL-${Date.now()}`;
    return `ALL: ${name}`;
  } else if (type === 'Panel Serial No.') {
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    if (end) return end;
  }

  return String(panelSerialNo || '').trim();
}

function parseInstallerIds(data = {}) {
  let raw = data.assignedInstallers !== undefined ? data.assignedInstallers : data.assignedInstaller;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      raw = parsed;
    } catch {
      raw = trimmed.includes(',') ? trimmed.split(',') : [trimmed];
    }
  }
  if (!Array.isArray(raw)) raw = [raw];
  return [
    ...new Set(
      raw
        .map((value) => {
          if (value == null) return '';
          if (typeof value === 'object') return String(value._id || value.id || '').trim();
          return String(value).trim();
        })
        .filter((id) => /^[a-f\d]{24}$/i.test(id))
    ),
  ];
}

function getAssignedInstallerIds(project) {
  const fromNew = Array.isArray(project?.assignedInstallers) ? project.assignedInstallers : [];
  const ids = fromNew
    .map((value) => String(value?._id || value || '').trim())
    .filter((id) => /^[a-f\d]{24}$/i.test(id));
  if (ids.length) return [...new Set(ids)];
  const legacy = project?.assignedInstaller;
  if (!legacy) return [];
  const legacyId = String(legacy?._id || legacy || '').trim();
  return /^[a-f\d]{24}$/i.test(legacyId) ? [legacyId] : [];
}

function assertProjectAccess(project, user) {
  if (!project || !user || user.role !== ROLES.USER) return;
  const assigned = getAssignedInstallerIds(project);
  if (!assigned.includes(String(user._id))) {
    throw new ApiError(403, 'You do not have access to this project');
  }
}

async function resolveInstallerAssignment(data, { required = false } = {}) {
  const ids = parseInstallerIds(data);
  if (!ids.length) {
    if (required) throw new ApiError(400, 'Assign at least one installer');
    return {};
  }

  const installers = [];
  for (const id of ids) {
    const installer = await userRepository.findById(id);
    if (!installer) throw new ApiError(400, 'Selected user not found');
    if (installer.role !== ROLES.USER) {
      throw new ApiError(400, 'Assigned installer must be a user with installer role');
    }
    if (installer.status !== USER_STATUS.ACTIVE) {
      throw new ApiError(400, 'Selected user must be active');
    }
    installers.push(installer);
  }

  return {
    assignedInstallers: installers.map((installer) => installer._id),
    assignedInstaller: installers[0]._id,
    installerName: installers.map((installer) => installer.name).filter(Boolean).join(', '),
  };
}

function sanitizeProjectForUser(project, user) {
  const doc = project?.toObject ? project.toObject() : { ...project };
  if (user?.role !== ROLES.ADMIN) {
    delete doc.installerRatings;
  }
  const ids = getAssignedInstallerIds(doc);
  doc.assignedInstallers = ids;
  doc.assignedInstaller = ids[0] || null;
  return doc;
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  parseJSONField,
  pickFields,
  applyProjectScopeFilter,
  buildPanelSerialNo,
  parseInstallerIds,
  getAssignedInstallerIds,
  assertProjectAccess,
  resolveInstallerAssignment,
  sanitizeProjectForUser,
};
