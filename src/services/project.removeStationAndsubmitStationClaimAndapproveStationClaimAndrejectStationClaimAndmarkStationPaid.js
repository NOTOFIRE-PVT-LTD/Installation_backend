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

const { assertProjectAccess } = require('./project.sanitizeProjectForUser');
const { fetchProjectById } = require('./project.listAndgetByIdAndcreateAndupdate');
const { seedClaimRequestsFromLegacy, syncClaimAggregates } = require('./project.addStation');
const { computeStationBonus } = require('./project.updateStation');

async function submitStationClaim(projectId, stationId, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  if (!(station.workPhotos.length > 0)) {
    throw new ApiError(400, 'Work photos are mandatory before submitting a claim');
  }
  if (!(station.amountClaimed > 0)) {
    throw new ApiError(400, 'Enter at least one amount requested before submitting');
  }

  // Keep claimRequests in sync for older stations that only have aggregate fields
  if (!Array.isArray(station.claimRequests) || station.claimRequests.length === 0) {
    seedClaimRequestsFromLegacy(station);
    syncClaimAggregates(station);
  }

  station.claimStatus = CLAIM_STATUS.PENDING_APPROVAL;
  project.updatedBy = actorId;
  await project.save();

  const savedProject = await fetchProjectById(projectId);
  const savedStation = savedProject.stations.id(stationId);

  whatsappNotificationService
    .notifyClaimSubmitted({
      project: savedProject,
      station: savedStation,
      submittedBy: user,
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[whatsapp] Claim notification error:', err.message);
    });

  return savedProject;
}

async function approveStationClaim(projectId, stationId, actorId) {
  const project = await projectRepository.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');
  if (station.claimStatus !== CLAIM_STATUS.PENDING_APPROVAL) {
    throw new ApiError(400, `Cannot approve a claim with status "${station.claimStatus}"`);
  }

  const bonus = computeStationBonus(project, station);
  station.claimStatus = CLAIM_STATUS.APPROVED;
  station.bonusEligible = bonus.eligible;
  station.bonusPercent = bonus.percent;
  station.bonusAmount = bonus.amount;
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

async function rejectStationClaim(projectId, stationId, reason, actorId) {
  const project = await projectRepository.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');
  if (station.claimStatus !== CLAIM_STATUS.PENDING_APPROVAL) {
    throw new ApiError(400, `Cannot reject a claim with status "${station.claimStatus}"`);
  }

  station.claimStatus = CLAIM_STATUS.REJECTED;
  station.remarks = station.remarks ? `${station.remarks} | Claim rejected: ${reason}` : `Claim rejected: ${reason}`;
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

async function markStationPaid(projectId, stationId, actorId) {
  const project = await projectRepository.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');
  if (station.claimStatus !== CLAIM_STATUS.APPROVED) {
    throw new ApiError(400, 'Only approved claims can be marked as paid');
  }

  station.claimStatus = CLAIM_STATUS.PAID;
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

async function removeStation(projectId, stationId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  await Promise.all(
    [...station.completePhotos, ...station.remainingPhotos, ...station.workPhotos].map((p) => uploadService.deleteAsset(p.publicId, 'image'))
  );
  await Promise.all(
    (station.dailyReports || []).flatMap((r) => [
      ...(r.photos || []).map((p) => uploadService.deleteAsset(p.publicId, 'image')),
      ...(r.videos || []).map((v) => uploadService.deleteAsset(v.publicId, 'video')),
    ])
  );
  await Promise.all(
    [station.checklistFile, station.checklistSignedFile, station.cadDrawingFile, ...(station.cadDrawingFiles || [])]
      .filter((f) => f?.publicId)
      .map((f) => uploadService.deleteAsset(f.publicId, f.resourceType === 'image' ? 'image' : 'raw'))
  );

  station.deleteOne();
  await project.save();

  return fetchProjectById(projectId);
}

async function resolveDailyReportMedia(data, files) {
  const photoFiles = files?.photos || [];
  const videoFiles = files?.videos || [];

  const uploadedPhotos = photoFiles.length
    ? await Promise.all(photoFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)))
    : [];
  const uploadedVideos = videoFiles.length
    ? await Promise.all(videoFiles.map((f) => uploadService.uploadVideoBuffer(f.buffer)))
    : [];

  const parseList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const normalize = (items) =>
    items
      .map((item) => ({
        url: String(item?.url || '').trim(),
        publicId: String(item?.publicId || item?.public_id || '').trim(),
      }))
      .filter((item) => item.url && item.publicId);

  return {
    photos: uploadedPhotos.length ? uploadedPhotos : normalize(parseList(data.photos)),
    videos: uploadedVideos.length ? uploadedVideos : normalize(parseList(data.videos)),
  };
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  submitStationClaim,
  approveStationClaim,
  rejectStationClaim,
  markStationPaid,
  removeStation,
  resolveDailyReportMedia,
};
