const reportRepository = require('../repositories/report.repository');
const uploadService = require('../services/upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { REPORT_STATUS, ROLES } = require('../config/constants');

const ALLOWED_SORT_FIELDS = ['date', 'progressPercentage', 'status', 'createdAt'];
const POPULATE = [
  { path: 'project', select: 'projectName panelSerialNo' },
  { path: 'submittedBy', select: 'name email' },
  { path: 'verifiedBy', select: 'name email' },
];

function assertOwnershipIfInstaller(report, requestingUser) {
  if (requestingUser.role === ROLES.USER && report.submittedBy._id.toString() !== requestingUser._id.toString()) {
    throw new ApiError(403, 'You can only access your own reports');
  }
}

async function list(query, requestingUser) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (requestingUser.role === ROLES.USER) {
    filter.submittedBy = requestingUser._id;
  } else if (query.submittedBy) {
    filter.submittedBy = query.submittedBy;
  }

  if (query.project) filter.project = query.project;
  if (query.status) filter.status = query.status;
  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = new Date(query.startDate);
    if (query.endDate) filter.date.$lte = new Date(query.endDate);
  }

  const { items, total } = await reportRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id, requestingUser) {
  const report = await reportRepository.findById(id, { populate: POPULATE });
  if (!report) throw new ApiError(404, 'Report not found');
  assertOwnershipIfInstaller(report, requestingUser);
  return report;
}

async function create(data, files, requestingUser) {
  const photoFiles = files?.sitePhotos || [];
  const videoFile = files?.siteVideo?.[0];

  if (photoFiles.length === 0) {
    throw new ApiError(400, 'At least one site photo is required');
  }

  const sitePhotos = await Promise.all(photoFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
  const siteVideo = videoFile ? await uploadService.uploadVideoBuffer(videoFile.buffer) : null;

  const report = await reportRepository.create({
    project: data.project,
    submittedBy: requestingUser._id,
    date: data.date,
    workDescription: data.workDescription,
    progressPercentage: data.progressPercentage,
    materialUsed: data.materialUsed || '',
    remarks: data.remarks || '',
    sitePhotos,
    siteVideo,
  });

  return getById(report._id, requestingUser);
}

async function update(id, data, files, requestingUser) {
  const report = await reportRepository.findById(id, { populate: POPULATE });
  if (!report) throw new ApiError(404, 'Report not found');
  assertOwnershipIfInstaller(report, requestingUser);

  if (report.status !== REPORT_STATUS.PENDING) {
    throw new ApiError(400, 'Only pending reports can be edited');
  }

  const updates = {};
  ['date', 'workDescription', 'progressPercentage', 'materialUsed', 'remarks'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  const photoFiles = files?.sitePhotos || [];
  if (photoFiles.length > 0) {
    await Promise.all(report.sitePhotos.map((p) => uploadService.deleteAsset(p.publicId, 'image')));
    updates.sitePhotos = await Promise.all(photoFiles.map((f) => uploadService.uploadImageBuffer(f.buffer)));
  }

  const videoFile = files?.siteVideo?.[0];
  if (videoFile) {
    if (report.siteVideo?.publicId) await uploadService.deleteAsset(report.siteVideo.publicId, 'video');
    updates.siteVideo = await uploadService.uploadVideoBuffer(videoFile.buffer);
  }

  await reportRepository.updateById(id, updates);
  return getById(id, requestingUser);
}

async function remove(id) {
  const report = await reportRepository.findById(id);
  if (!report) throw new ApiError(404, 'Report not found');

  await Promise.all(report.sitePhotos.map((p) => uploadService.deleteAsset(p.publicId, 'image')));
  if (report.siteVideo?.publicId) await uploadService.deleteAsset(report.siteVideo.publicId, 'video');

  await reportRepository.deleteById(id);
}

async function verify(id, actorId) {
  const report = await reportRepository.findById(id);
  if (!report) throw new ApiError(404, 'Report not found');
  if (report.status === REPORT_STATUS.VERIFIED) {
    throw new ApiError(400, 'Report is already verified');
  }

  await reportRepository.updateById(id, {
    status: REPORT_STATUS.VERIFIED,
    verifiedBy: actorId,
    verifiedAt: new Date(),
  });

  return reportRepository.findById(id, { populate: POPULATE });
}

module.exports = { list, getById, create, update, remove, verify };
