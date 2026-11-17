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

const { assertProjectAccess, parseJSONField } = require('./project.sanitizeProjectForUser');
const { fetchProjectById, list } = require('./project.listAndgetByIdAndcreateAndupdate');
const { materialsFromLoaItems, parseDirectMedia } = require('./project.removeAndlistAllForDropdownAndgetApprovalsQueue');

async function addStation(projectId, data, files, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const completeFiles = files?.completePhotos || [];
  const remainingFiles = files?.remainingPhotos || [];
  const directCompletePhotos = parseDirectMedia(data.directCompletePhotos, { folder: env.cloudinary.imageFolder });
  const directRemainingPhotos = parseDirectMedia(data.directRemainingPhotos, { folder: env.cloudinary.imageFolder });

  const newStation = { name: data.name };
  applyStationFields(newStation, data);
  // Every station starts with the same LOA materials list (item + qty) from the project.
  if (!Array.isArray(newStation.materials) || newStation.materials.length === 0) {
    newStation.materials = materialsFromLoaItems(project.loaItems);
  }
  newStation.completePhotos = [
    ...(await Promise.all(completeFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)))),
    ...directCompletePhotos,
  ];
  newStation.remainingPhotos = [
    ...(await Promise.all(remainingFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)))),
    ...directRemainingPhotos,
  ];

  project.stations.push(newStation);
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

function normalizeClaimRequests(rawRequests = []) {
  const list = Array.isArray(rawRequests) ? rawRequests : [];
  return list
    .map((entry) => {
      const amountRequested = Math.max(0, Number(entry?.amountRequested) || 0);
      const amountCleared = Math.max(0, Number(entry?.amountCleared) || 0);
      const amountAfterTds = Math.round(amountRequested * (1 - TDS_PERCENT / 100));
      return {
        ...(entry?._id ? { _id: entry._id } : {}),
        date: entry?.date || null,
        amountRequested,
        amountAfterTds,
        amountCleared,
        note: typeof entry?.note === 'string' ? entry.note.trim() : '',
      };
    })
    .filter((entry) => entry.amountRequested > 0 || entry.amountCleared > 0 || entry.date || entry.note);
}

function syncClaimAggregates(station) {
  const requests = Array.isArray(station.claimRequests) ? station.claimRequests : [];
  const totalRequested = requests.reduce((sum, r) => sum + (Number(r.amountRequested) || 0), 0);
  const totalAfterTds = requests.reduce((sum, r) => sum + (Number(r.amountAfterTds) || 0), 0);
  const totalCleared = requests.reduce((sum, r) => sum + (Number(r.amountCleared) || 0), 0);

  station.amountClaimed = totalRequested;
  station.amountAfterTds = totalAfterTds;
  station.amountCleared = totalCleared;

  const dated = requests
    .map((r) => r.date)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a);
  station.claimDate = dated[0] || null;
}

function seedClaimRequestsFromLegacy(station) {
  const existing = Array.isArray(station.claimRequests) ? station.claimRequests : [];
  if (existing.length > 0) return;
  const requested = Number(station.amountClaimed) || 0;
  const cleared = Number(station.amountCleared) || 0;
  if (!(requested > 0 || cleared > 0 || station.claimDate)) return;

  station.claimRequests = [
    {
      date: station.claimDate || null,
      amountRequested: requested,
      amountAfterTds: Math.round(requested * (1 - TDS_PERCENT / 100)),
      amountCleared: cleared,
      note: '',
    },
  ];
}

function applyStationFields(station, data) {
  STATION_TEXT_FIELDS.forEach((field) => {
    if (data[field] !== undefined) station[field] = data[field];
  });
  STATION_NUMBER_FIELDS.forEach((field) => {
    if (data[field] !== undefined) station[field] = Number(data[field]) || 0;
  });
  STATION_DATE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) station[field] = data[field] || null;
  });
  STATION_JSON_FIELDS.forEach((field) => {
    if (data[field] !== undefined) {
      const parsed = parseJSONField(data[field]);
      if (parsed !== undefined) station[field] = parsed;
    }
  });

  if (data.claimRequests !== undefined) {
    const parsed = parseJSONField(data.claimRequests);
    station.claimRequests = normalizeClaimRequests(parsed);
    syncClaimAggregates(station);

    const allocated = Number(station.installationAmount) || 0;
    const requested = Number(station.amountClaimed) || 0;
    if (allocated > 0 && requested > allocated) {
      throw new ApiError(
        400,
        `Total amount requested (${requested}) cannot exceed installation amount allocated (${allocated})`
      );
    }
  } else if (data.amountClaimed !== undefined || data.amountCleared !== undefined || data.claimDate !== undefined) {
    // Backward-compatible single-field updates
    if (data.amountClaimed !== undefined) station.amountClaimed = Number(data.amountClaimed) || 0;
    if (data.amountCleared !== undefined) station.amountCleared = Number(data.amountCleared) || 0;
    if (data.claimDate !== undefined) station.claimDate = data.claimDate || null;
    station.amountAfterTds = Math.round((Number(station.amountClaimed) || 0) * (1 - TDS_PERCENT / 100));

    if (!Array.isArray(station.claimRequests) || station.claimRequests.length === 0) {
      seedClaimRequestsFromLegacy(station);
    } else if (station.claimRequests.length === 1) {
      station.claimRequests[0].amountRequested = Number(station.amountClaimed) || 0;
      station.claimRequests[0].amountAfterTds = station.amountAfterTds;
      station.claimRequests[0].amountCleared = Number(station.amountCleared) || 0;
      if (data.claimDate !== undefined) station.claimRequests[0].date = data.claimDate || null;
    }
    syncClaimAggregates(station);
  } else {
    seedClaimRequestsFromLegacy(station);
    syncClaimAggregates(station);
  }
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  addStation,
  normalizeClaimRequests,
  syncClaimAggregates,
  seedClaimRequestsFromLegacy,
  applyStationFields,
};
