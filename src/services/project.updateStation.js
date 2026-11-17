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
const { parseDirectMedia, parseIdList } = require('./project.removeAndlistAllForDropdownAndgetApprovalsQueue');
const { applyStationFields } = require('./project.addStation');

async function updateStation(
  projectId,
  stationId,
  data,
  files,
  removePhotoIdsRaw,
  removeCadFileIdsRaw,
  removeCadDrawingFileRaw,
  actorId,
  user
) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  applyStationFields(station, data);
  station.markModified('materials'); // ensure Mongoose detects subdocument array changes
  const removeIds = new Set(parseIdList(removePhotoIdsRaw));
  if (removeIds.size > 0) {
    const toRemove = [...station.completePhotos, ...station.remainingPhotos, ...station.workPhotos].filter((p) =>
      removeIds.has(p.publicId)
    );
    await Promise.all(toRemove.map((p) => uploadService.deleteAsset(p.publicId, 'image')));
    station.completePhotos = station.completePhotos.filter((p) => !removeIds.has(p.publicId));
    station.remainingPhotos = station.remainingPhotos.filter((p) => !removeIds.has(p.publicId));
    station.workPhotos = station.workPhotos.filter((p) => !removeIds.has(p.publicId));
  }

  const removeCadIds = new Set(parseIdList(removeCadFileIdsRaw));
  if (removeCadIds.size > 0) {
    const toRemove = (station.cadDrawingFiles || []).filter((f) => removeCadIds.has(f.publicId));
    await Promise.all(
      toRemove.map((f) => uploadService.deleteAsset(f.publicId, f.resourceType === 'raw' ? 'raw' : 'image'))
    );
    station.cadDrawingFiles = (station.cadDrawingFiles || []).filter((f) => !removeCadIds.has(f.publicId));
  }

  const shouldRemoveCadDrawingFile =
    String(removeCadDrawingFileRaw || '').toLowerCase() === 'true' || removeCadDrawingFileRaw === true;
  if (shouldRemoveCadDrawingFile && station.cadDrawingFile?.publicId) {
    const oldId = station.cadDrawingFile.publicId;
    await uploadService.deleteAsset(oldId, 'image');
    await uploadService.deleteAsset(oldId, 'raw');
    station.set('cadDrawingFile', undefined);
    station.markModified('cadDrawingFile');
  }

  const newCompleteFiles = files?.completePhotos || [];
  if (newCompleteFiles.length > 0) {
    const uploaded = await Promise.all(newCompleteFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.completePhotos = [...station.completePhotos, ...uploaded];
  }
  const directCompletePhotos = parseDirectMedia(data.directCompletePhotos, { folder: env.cloudinary.imageFolder });
  if (directCompletePhotos.length > 0) {
    station.completePhotos = [...station.completePhotos, ...directCompletePhotos];
  }

  const newRemainingFiles = files?.remainingPhotos || [];
  if (newRemainingFiles.length > 0) {
    const uploaded = await Promise.all(newRemainingFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.remainingPhotos = [...station.remainingPhotos, ...uploaded];
  }
  const directRemainingPhotos = parseDirectMedia(data.directRemainingPhotos, { folder: env.cloudinary.imageFolder });
  if (directRemainingPhotos.length > 0) {
    station.remainingPhotos = [...station.remainingPhotos, ...directRemainingPhotos];
  }

  const newWorkPhotos = files?.workPhotos || [];
  if (newWorkPhotos.length > 0) {
    const uploaded = await Promise.all(newWorkPhotos.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.workPhotos = [...station.workPhotos, ...uploaded];
  }
  const directWorkPhotos = parseDirectMedia(data.directWorkPhotos, { folder: env.cloudinary.imageFolder });
  if (directWorkPhotos.length > 0) {
    station.workPhotos = [...station.workPhotos, ...directWorkPhotos];
  }

  const checklistFile = files?.checklistFile?.[0];
  const directChecklistFile = parseDirectMedia(data.directChecklistFile, { folder: env.cloudinary.documentFolder })[0];
  if (checklistFile || directChecklistFile) {
    if (station.checklistFile?.publicId) await uploadService.deleteAsset(station.checklistFile.publicId, 'raw');
    station.checklistFile = checklistFile
      ? await uploadService.uploadDocumentBuffer(checklistFile.buffer)
      : directChecklistFile;
  }

  const checklistSignedFile = files?.checklistSignedFile?.[0];
  const directChecklistSignedFile = parseDirectMedia(data.directChecklistSignedFile, {
    folder: env.cloudinary.documentFolder,
  })[0];
  if (checklistSignedFile || directChecklistSignedFile) {
    if (station.checklistSignedFile?.publicId) await uploadService.deleteAsset(station.checklistSignedFile.publicId, 'raw');
    station.checklistSignedFile = checklistSignedFile
      ? await uploadService.uploadDocumentBuffer(checklistSignedFile.buffer)
      : directChecklistSignedFile;
  }

  const cadDrawingFile = files?.cadDrawingFile?.[0];
  const directCadDrawingFile = parseDirectMedia(data.directCadDrawingFile, { folder: env.cloudinary.cadFolder })[0];
  if (cadDrawingFile || directCadDrawingFile) {
    if (station.cadDrawingFile?.publicId) {
      const oldId = station.cadDrawingFile.publicId;
      await uploadService.deleteAsset(oldId, 'image');
      await uploadService.deleteAsset(oldId, 'raw');
    }
    if (cadDrawingFile) {
      const resourceType = cadDrawingFile.mimetype === 'application/pdf' ? 'raw' : 'image';
      station.cadDrawingFile =
        resourceType === 'raw'
          ? await uploadService.uploadDocumentBuffer(cadDrawingFile.buffer)
          : await uploadService.uploadImageBuffer(cadDrawingFile.buffer);
    } else {
      station.cadDrawingFile = directCadDrawingFile;
    }
  }

  const newCadFiles = files?.cadDrawingFiles || [];
  if (newCadFiles.length > 0) {
    const uploaded = await Promise.all(newCadFiles.map((f) => uploadService.uploadCadFile(f)));
    station.cadDrawingFiles = [...(station.cadDrawingFiles || []), ...uploaded];
  }
  const directCadFiles = parseDirectMedia(data.directCadDrawingFiles, {
    folder: env.cloudinary.cadFolder,
    allowResourceType: true,
    allowOriginalName: true,
  });
  if (directCadFiles.length > 0) {
    station.cadDrawingFiles = [...(station.cadDrawingFiles || []), ...directCadFiles];
  }

  project.updatedBy = actorId;
  project.markModified('stations');
  await project.save();

  return fetchProjectById(projectId);
}

function computeStationBonus(project, station) {
  if (!station.commissioningDate) return { eligible: false, amount: 0, percent: 0 };
  const onTime = project.targetDate ? new Date(station.commissioningDate) <= new Date(project.targetDate) : true;
  const qualityOk = station.workPhotos.length > 0;
  const eligible = onTime && qualityOk;
  const percent = project.bonusPercentOverride != null ? project.bonusPercentOverride : DEFAULT_BONUS_PERCENT;
  const amount = eligible ? Math.round(((station.amountClaimed || 0) * percent) / 100) : 0;
  return { eligible, amount, percent };
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  TEXT_FIELDS,
  NUMBER_FIELDS,
  DATE_FIELDS,
  JSON_FIELDS,
  SINGLE_DOCUMENT_FIELDS,
  updateStation,
  computeStationBonus,
};
