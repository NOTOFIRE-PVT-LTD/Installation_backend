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

const { applyProjectScopeFilter, parseJSONField } = require('./project.sanitizeProjectForUser');

async function remove(id) {
  const project = await projectRepository.findById(id);
  if (!project) throw new ApiError(404, 'Project not found');

  await Promise.all(
    SINGLE_DOCUMENT_FIELDS.filter((field) => project[field]?.publicId).map((field) =>
      uploadService.deleteAsset(project[field].publicId, 'raw')
    )
  );
  await Promise.all(project.commissioningVideos.map((v) => uploadService.deleteAsset(v.publicId, 'video')));
  await Promise.all(
    project.stations.flatMap((s) =>
      [...s.completePhotos, ...s.remainingPhotos, ...s.workPhotos].map((p) => uploadService.deleteAsset(p.publicId, 'image'))
    )
  );
  await Promise.all(
    project.stations.flatMap((s) =>
      (s.dailyReports || []).flatMap((r) => [
        ...(r.photos || []).map((p) => uploadService.deleteAsset(p.publicId, 'image')),
        ...(r.videos || []).map((v) => uploadService.deleteAsset(v.publicId, 'video')),
      ])
    )
  );
  await Promise.all(
    project.stations
      .flatMap((s) => [s.checklistFile, s.checklistSignedFile, s.cadDrawingFile, ...(s.cadDrawingFiles || [])])
      .filter((f) => f?.publicId)
      .map((f) => uploadService.deleteAsset(f.publicId, f.resourceType === 'image' ? 'image' : 'raw'))
  );
  await Promise.all(
    project.dailyReports.flatMap((r) => [
      ...(r.photos || []).map((p) => uploadService.deleteAsset(p.publicId, 'image')),
      ...(r.videos || []).map((v) => uploadService.deleteAsset(v.publicId, 'video')),
    ])
  );

  await projectRepository.deleteById(id);
}

async function listAllForDropdown(user) {
  const filter = {};
  applyProjectScopeFilter(filter, user);
  return projectRepository.find(filter, { select: 'projectName panelSerialNo', sort: { projectName: 1 } });
}

async function getApprovalsQueue() {
  const projects = await projectRepository.find(
    { 'stations.claimStatus': CLAIM_STATUS.PENDING_APPROVAL },
    { select: 'projectName panelSerialNo targetDate stations' }
  );

  const queue = [];
  projects.forEach((p) => {
    p.stations.forEach((s) => {
      if (s.claimStatus === CLAIM_STATUS.PENDING_APPROVAL) {
        queue.push({
          projectId: p._id,
          projectName: p.projectName,
          panelSerialNo: p.panelSerialNo,
          stationId: s._id,
          stationName: s.name,
          installerName: s.installer?.name || '',
          commissioningDate: s.commissioningDate,
          amountClaimed: s.amountClaimed,
        });
      }
    });
  });

  return queue.sort((a, b) => new Date(b.commissioningDate || 0) - new Date(a.commissioningDate || 0));
}

function parseIdList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

function parseDirectMedia(raw, { folder, allowResourceType = false, allowOriginalName = false } = {}) {
  const parsed = parseJSONField(raw);
  const items = Array.isArray(parsed) ? parsed : [];
  const folderPrefix = `${String(folder || '').replace(/\/+$/, '')}/`;
  const cloudName = String(env.cloudinary.cloudName || '').trim();

  return items
    .map((item) => {
      const url = String(item?.url || '').trim();
      const publicId = String(item?.publicId || item?.public_id || '').trim();
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return null;
      }

      const isExpectedCloudinaryUrl =
        parsedUrl.protocol === 'https:' &&
        parsedUrl.hostname === 'res.cloudinary.com' &&
        (!cloudName || parsedUrl.pathname.startsWith(`/${cloudName}/`));
      if (!url || !publicId || !publicId.startsWith(folderPrefix) || !isExpectedCloudinaryUrl) return null;

      const media = { url, publicId };
      if (allowResourceType) media.resourceType = item?.resourceType === 'raw' ? 'raw' : 'image';
      if (allowOriginalName && item?.originalName) media.originalName = String(item.originalName).trim().slice(0, 255);
      return media;
    })
    .filter(Boolean);
}

function materialsFromLoaItems(loaItems = []) {
  return (Array.isArray(loaItems) ? loaItems : [])
    .filter((row) => String(row?.item || '').trim())
    .map((row) => ({
      item: String(row.item).trim(),
      qty: Math.max(0, Number(row.qty) || 0),
      unit: String(row.unit || 'Nos').trim() || 'Nos',
    }));
}

function syncStationMaterialsFromLoa(project) {
  const loaMaterials = materialsFromLoaItems(project.loaItems);
  if (!loaMaterials.length) return;

  (project.stations || []).forEach((station) => {
    const existing = Array.isArray(station.materials) ? station.materials : [];

    if (existing.length === 0) {
      // Station has never had materials set — seed from LOA
      station.materials = loaMaterials.map((row) => ({ ...row }));
    } else {
      // Station already has saved (possibly customised) materials.
      // Only append LOA items that are not yet present; NEVER touch existing quantities.
      const existingNames = new Set(
        existing.map((m) => String(m.item || '').trim().toLowerCase())
      );
      const newItems = loaMaterials
        .filter((loa) => !existingNames.has(String(loa.item || '').trim().toLowerCase()))
        .map((row) => ({ item: row.item, qty: 0, unit: row.unit }));

      if (newItems.length > 0) {
        station.materials = [...existing, ...newItems];
      }
      // If nothing new, leave station.materials completely untouched.
    }

    if (typeof station.markModified === 'function') station.markModified('materials');
  });
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  remove,
  listAllForDropdown,
  getApprovalsQueue,
  parseIdList,
  parseDirectMedia,
  materialsFromLoaItems,
  syncStationMaterialsFromLoa,
};
