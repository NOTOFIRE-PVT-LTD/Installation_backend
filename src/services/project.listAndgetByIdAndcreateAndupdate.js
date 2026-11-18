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

const { applyProjectScopeFilter, assertProjectAccess, buildPanelSerialNo, pickFields, resolveInstallerAssignment, sanitizeProjectForUser } = require('./project.sanitizeProjectForUser');
const { materialsFromLoaItems, syncStationMaterialsFromLoa } = require('./project.removeAndlistAllForDropdownAndgetApprovalsQueue');

async function list(query, user) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const scope = {};
  applyProjectScopeFilter(scope, user);

  let filter = { ...scope };
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    const searchClause = {
      $or: [
        { projectName: regex },
        { installerName: regex },
        { contractor: regex },
        { panelSerialNo: regex },
        { railwayZone: regex },
      ],
    };
    filter = Object.keys(scope).length ? { $and: [scope, searchClause] } : searchClause;
  }

  const { items, total } = await projectRepository.paginate({ filter, sort, skip, limit: pageSize });
  return buildPaginatedResult({
    items: items.map((item) => sanitizeProjectForUser(item, user)),
    total,
    page,
    pageSize,
  });
}

async function fetchProjectById(id) {
  const project = await projectRepository.findById(id);
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
}

async function getById(id, user) {
  const project = await fetchProjectById(id);
  assertProjectAccess(project, user);

  // Backfill Materials Used from project LOA items for stations that never got them.
  const loaMaterials = materialsFromLoaItems(project.loaItems);
  if (loaMaterials.length > 0) {
    let dirty = false;
    (project.stations || []).forEach((station) => {
      if (!Array.isArray(station.materials) || station.materials.length === 0) {
        station.materials = loaMaterials.map((row) => ({ ...row }));
        dirty = true;
      }
    });
    if (dirty) {
      project.markModified('stations');
      await project.save();
    }
  }

  return sanitizeProjectForUser(project, user);
}

async function create(data, files, actorId, user) {
  const panelSerialNo = buildPanelSerialNo(data);
  if (!panelSerialNo) throw new ApiError(400, 'Serial number details are required');

  const existing = await projectRepository.findOne({ panelSerialNo });
  if (existing) throw new ApiError(409, 'A project with this serial number already exists');

  const payload = {
    ...pickFields(data, { isAdmin: user?.role === ROLES.ADMIN }),
    panelSerialNo,
    serialType: data.serialType || 'LHS/ASD',
    panelSerialStart: data.panelSerialStart || '',
    panelSerialEnd: data.panelSerialEnd || '',
    ...(await resolveInstallerAssignment(data, { required: true })),
    createdBy: actorId,
    updatedBy: actorId,
  };

  for (const field of SINGLE_DOCUMENT_FIELDS) {
    const file = files?.[field]?.[0];
    if (file) {
      payload[field] = await uploadService.uploadDocumentBuffer(file.buffer);
    }
  }

  const videoFiles = files?.commissioningVideos || [];
  if (videoFiles.length > 0) {
    payload.commissioningVideos = await Promise.all(videoFiles.map((f) => uploadService.uploadVideoBuffer(f.buffer)));
  }

  return sanitizeProjectForUser(await projectRepository.create(payload), user);
}

async function update(id, data, files, actorId, user) {
  const project = await projectRepository.findById(id);
  if (!project) throw new ApiError(404, 'Project not found');

  const updates = { ...pickFields(data, { isAdmin: user?.role === ROLES.ADMIN }), updatedBy: actorId };

  const hasSerialInput =
    data.serialType !== undefined ||
    data.panelSerialStart !== undefined ||
    data.panelSerialEnd !== undefined ||
    data.panelSerialNo !== undefined;

  if (hasSerialInput) {
    const panelSerialNo = buildPanelSerialNo({
      serialType: data.serialType !== undefined ? data.serialType : project.serialType,
      panelSerialStart: data.panelSerialStart !== undefined ? data.panelSerialStart : project.panelSerialStart,
      panelSerialEnd: data.panelSerialEnd !== undefined ? data.panelSerialEnd : project.panelSerialEnd,
      panelSerialNo: data.panelSerialNo !== undefined ? data.panelSerialNo : project.panelSerialNo,
      projectName: data.projectName !== undefined ? data.projectName : project.projectName,
    });
    if (!panelSerialNo) throw new ApiError(400, 'Serial number details are required');
    if (panelSerialNo !== project.panelSerialNo) {
      const existing = await projectRepository.findOne({ panelSerialNo });
      if (existing) throw new ApiError(409, 'A project with this serial number already exists');
    }
    updates.panelSerialNo = panelSerialNo;
  }

  if (data.assignedInstaller !== undefined || data.assignedInstallers !== undefined) {
    Object.assign(updates, await resolveInstallerAssignment(data, { required: true }));
  }

  for (const field of SINGLE_DOCUMENT_FIELDS) {
    const file = files?.[field]?.[0];
    if (file) {
      if (project[field]?.publicId) await uploadService.deleteAsset(project[field].publicId, 'raw');
      updates[field] = await uploadService.uploadDocumentBuffer(file.buffer);
    }
  }

  const videoFiles = files?.commissioningVideos || [];
  if (videoFiles.length > 0) {
    await Promise.all(project.commissioningVideos.map((v) => uploadService.deleteAsset(v.publicId, 'video')));
    updates.commissioningVideos = await Promise.all(videoFiles.map((f) => uploadService.uploadVideoBuffer(f.buffer)));
  }

  // Keep Materials Used on every station aligned with project LOA items.
  if (data.loaItems !== undefined && updates.loaItems !== undefined) {
    Object.assign(project, updates);
    syncStationMaterialsFromLoa(project);
    project.markModified('stations');
    await project.save();
    return getById(id, user);
  }

  await projectRepository.updateById(id, updates);
  return getById(id, user);
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  list,
  fetchProjectById,
  getById,
  create,
  update,
};
