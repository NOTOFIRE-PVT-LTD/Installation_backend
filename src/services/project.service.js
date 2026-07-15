const projectRepository = require('../repositories/project.repository');
const userRepository = require('../repositories/user.repository');
const uploadService = require('./upload.service');
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
    filter.assignedInstaller = user._id;
  }
  return filter;
}

function buildPanelSerialNo({ serialType, panelSerialStart, panelSerialEnd, panelSerialNo }) {
  const type = serialType || 'Panel Serial No.';
  const start = String(panelSerialStart || '').trim();
  const end = String(panelSerialEnd || '').trim();

  if (type === 'Panel Serial No.') {
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    if (end) return end;
  } else if (type === 'LHS' || type === 'AHD') {
    if (start) return `${type}: ${start}`;
  }

  return String(panelSerialNo || '').trim();
}

function assertProjectAccess(project, user) {
  if (!project || !user || user.role !== ROLES.USER) return;
  const assigned = project.assignedInstaller?.toString?.() || String(project.assignedInstaller || '');
  if (!assigned || assigned !== user._id.toString()) {
    throw new ApiError(403, 'You do not have access to this project');
  }
}

async function resolveInstallerAssignment(data, { required = false } = {}) {
  const id = data.assignedInstaller;
  if (!id) {
    if (required) throw new ApiError(400, 'Assigned installer is required');
    return {};
  }

  const installer = await userRepository.findById(id);
  if (!installer) throw new ApiError(400, 'Selected user not found');
  if (installer.role !== ROLES.USER) {
    throw new ApiError(400, 'Assigned installer must be a user with installer role');
  }
  if (installer.status !== USER_STATUS.ACTIVE) {
    throw new ApiError(400, 'Selected user must be active');
  }

  return {
    assignedInstaller: installer._id,
    installerName: installer.name,
  };
}

function sanitizeProjectForUser(project, user) {
  const doc = project?.toObject ? project.toObject() : { ...project };
  if (user?.role !== ROLES.ADMIN) {
    delete doc.installerRatings;
  }
  return doc;
}

async function list(query, user) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const scope = {};
  applyProjectScopeFilter(scope, user);

  const filter = { ...scope };
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$and = [
      scope,
      {
        $or: [
          { projectName: regex },
          { installerName: regex },
          { contractor: regex },
          { panelSerialNo: regex },
          { railwayZone: regex },
        ],
      },
    ];
    delete filter.assignedInstaller;
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
    serialType: data.serialType || 'Panel Serial No.',
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
    });
    if (!panelSerialNo) throw new ApiError(400, 'Serial number details are required');
    if (panelSerialNo !== project.panelSerialNo) {
      const existing = await projectRepository.findOne({ panelSerialNo });
      if (existing) throw new ApiError(409, 'A project with this serial number already exists');
    }
    updates.panelSerialNo = panelSerialNo;
  }

  if (data.assignedInstaller !== undefined) {
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

  await projectRepository.updateById(id, updates);
  return getById(id, user);
}

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
      .flatMap((s) => [s.checklistFile, s.checklistSignedFile, s.cadDrawingFile])
      .filter((f) => f?.publicId)
      .map((f) => uploadService.deleteAsset(f.publicId, 'raw'))
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

async function addStation(projectId, data, files, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const completeFiles = files?.completePhotos || [];
  const remainingFiles = files?.remainingPhotos || [];

  const newStation = { name: data.name };
  applyStationFields(newStation, data);
  newStation.completePhotos = await Promise.all(completeFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
  newStation.remainingPhotos = await Promise.all(remainingFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));

  project.stations.push(newStation);
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

const STATION_TEXT_FIELDS = ['name', 'type', 'reasonForDelay', 'remarks'];
const STATION_NUMBER_FIELDS = ['installationAmount', 'amountClaimed', 'amountCleared'];
const STATION_DATE_FIELDS = ['startDate', 'completionDate', 'commissioningDate', 'claimDate'];
const STATION_JSON_FIELDS = ['sse', 'installer', 'supervisor', 'materials'];
const TDS_PERCENT = 2;

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

  if (data.amountClaimed !== undefined || station.amountClaimed != null) {
    const requested = Number(station.amountClaimed) || 0;
    station.amountAfterTds = Math.round(requested * (1 - TDS_PERCENT / 100));
  }
}

async function updateStation(projectId, stationId, data, files, removePhotoIdsRaw, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  applyStationFields(station, data);

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

  const newCompleteFiles = files?.completePhotos || [];
  if (newCompleteFiles.length > 0) {
    const uploaded = await Promise.all(newCompleteFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.completePhotos = [...station.completePhotos, ...uploaded];
  }

  const newRemainingFiles = files?.remainingPhotos || [];
  if (newRemainingFiles.length > 0) {
    const uploaded = await Promise.all(newRemainingFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.remainingPhotos = [...station.remainingPhotos, ...uploaded];
  }

  const newWorkPhotos = files?.workPhotos || [];
  if (newWorkPhotos.length > 0) {
    const uploaded = await Promise.all(newWorkPhotos.map((f) => uploadService.uploadImageBuffer(f.buffer)));
    station.workPhotos = [...station.workPhotos, ...uploaded];
  }

  const checklistFile = files?.checklistFile?.[0];
  if (checklistFile) {
    if (station.checklistFile?.publicId) await uploadService.deleteAsset(station.checklistFile.publicId, 'raw');
    station.checklistFile = await uploadService.uploadDocumentBuffer(checklistFile.buffer);
  }

  const checklistSignedFile = files?.checklistSignedFile?.[0];
  if (checklistSignedFile) {
    if (station.checklistSignedFile?.publicId) await uploadService.deleteAsset(station.checklistSignedFile.publicId, 'raw');
    station.checklistSignedFile = await uploadService.uploadDocumentBuffer(checklistSignedFile.buffer);
  }

  const cadDrawingFile = files?.cadDrawingFile?.[0];
  if (cadDrawingFile) {
    if (station.cadDrawingFile?.publicId) {
      const oldId = station.cadDrawingFile.publicId;
      await uploadService.deleteAsset(oldId, 'image');
      await uploadService.deleteAsset(oldId, 'raw');
    }
    const resourceType = cadDrawingFile.mimetype === 'application/pdf' ? 'raw' : 'image';
    station.cadDrawingFile =
      resourceType === 'raw'
        ? await uploadService.uploadDocumentBuffer(cadDrawingFile.buffer)
        : await uploadService.uploadImageBuffer(cadDrawingFile.buffer);
  }

  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
}

function computeStationBonus(project, station) {
  if (!station.commissioningDate) return { eligible: false, amount: 0, percent: 0 };
  const onTime = project.targetDate ? new Date(station.commissioningDate) <= new Date(project.targetDate) : true;
  const qualityOk = Boolean(station.checklistFile) && Boolean(station.checklistSignedFile) && station.workPhotos.length > 0;
  const eligible = onTime && qualityOk;
  const percent = project.bonusPercentOverride != null ? project.bonusPercentOverride : DEFAULT_BONUS_PERCENT;
  const amount = eligible ? Math.round(((station.amountClaimed || 0) * percent) / 100) : 0;
  return { eligible, amount, percent };
}

async function submitStationClaim(projectId, stationId, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const station = project.stations.id(stationId);
  if (!station) throw new ApiError(404, 'Station not found');

  if (!(station.checklistFile && station.checklistSignedFile && station.workPhotos.length > 0)) {
    throw new ApiError(400, 'Checklist upload, signed checklist, and work photos are mandatory before submitting a claim');
  }
  if (!(station.amountClaimed > 0)) {
    throw new ApiError(400, 'Enter the amount claimed before submitting');
  }

  station.claimStatus = CLAIM_STATUS.PENDING_APPROVAL;
  project.updatedBy = actorId;
  await project.save();

  return fetchProjectById(projectId);
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
    [station.checklistFile, station.checklistSignedFile, station.cadDrawingFile]
      .filter((f) => f?.publicId)
      .map((f) => uploadService.deleteAsset(f.publicId, 'raw'))
  );

  station.deleteOne();
  await project.save();

  return fetchProjectById(projectId);
}

async function addDailyReport(projectId, data, files, actorId, user) {
  const project = await fetchProjectById(projectId);
  assertProjectAccess(project, user);

  const photoFiles = files?.photos || [];
  const videoFiles = files?.videos || [];

  project.dailyReports.push({
    photos: await Promise.all(photoFiles.map((f) => uploadService.uploadImageBuffer(f.buffer))),
    videos: await Promise.all(videoFiles.map((f) => uploadService.uploadVideoBuffer(f.buffer))),
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

  const photoFiles = files?.photos || [];
  const videoFiles = files?.videos || [];

  station.dailyReports.push({
    photos: await Promise.all(photoFiles.map((f) => uploadService.uploadImageBuffer(f.buffer))),
    videos: await Promise.all(videoFiles.map((f) => uploadService.uploadVideoBuffer(f.buffer))),
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

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  sanitizeProjectForUser,
  listAllForDropdown,
  getApprovalsQueue,
  addStation,
  updateStation,
  removeStation,
  submitStationClaim,
  approveStationClaim,
  rejectStationClaim,
  markStationPaid,
  addDailyReport,
  removeDailyReport,
  addStationDailyReport,
  removeStationDailyReport,
};
