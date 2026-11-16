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
const { resolveDailyReportMedia } = require('./project.removeStationAndsubmitStationClaimAndapproveStationClaimAndrejectStationClaimAndmarkStationPaid');

async function addDailyReport(projectId, data, files, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const { photos, videos } = await resolveDailyReportMedia(data, files);
  if (!photos.length && !videos.length && !String(data.comment || '').trim() && !String(data.issue || '').trim()) {
    throw new ApiError(400, 'Add at least one photo, video, comment, or issue');
  }

  project.dailyReports.push({
    photos,
    videos,
    comment: data.comment || '',
    issue: data.issue || '',
    createdBy: actorId,
  });
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

async function removeDailyReport(projectId, reportId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const entry = project.dailyReports.id(reportId);
  if (!entry) throw new ApiError(404, 'Daily report entry not found');

  await Promise.all((entry.photos || []).map((p) => uploadService.deleteAsset(p.publicId, 'image')));
  await Promise.all((entry.videos || []).map((v) => uploadService.deleteAsset(v.publicId, 'video')));

  entry.deleteOne();
  await project.save();

  return fetchProjectById(projectId);
}

async function addStationDailyReport(projectId, stationId, data, files, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  const { photos, videos } = await resolveDailyReportMedia(data, files);
  if (!photos.length && !videos.length && !String(data.comment || '').trim() && !String(data.issue || '').trim()) {
    throw new ApiError(400, 'Add at least one photo, video, comment, or issue');
  }

  station.dailyReports.push({
    photos,
    videos,
    comment: data.comment || '',
    issue: data.issue || '',
    createdBy: actorId,
  });
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

async function removeStationDailyReport(projectId, stationId, reportId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  const entry = station.dailyReports.id(reportId);
  if (!entry) throw new ApiError(404, 'Daily report entry not found');

  await Promise.all((entry.photos || []).map((p) => uploadService.deleteAsset(p.publicId, 'image')));
  await Promise.all((entry.videos || []).map((v) => uploadService.deleteAsset(v.publicId, 'video')));

  entry.deleteOne();
  await project.save();

  return fetchProjectById(projectId);
}

async function listInstallerOptions() {
  return userRepository.find(
    { status: USER_STATUS.ACTIVE, role: ROLES.USER },
    { select: 'name email mobileNumber', sort: { name: 1 } }
  );
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  addDailyReport,
  removeDailyReport,
  addStationDailyReport,
  removeStationDailyReport,
  listInstallerOptions,
};
