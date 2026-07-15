const tenderRepository = require('../repositories/tender.repository');
const divisionRepository = require('../repositories/division.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['tenderName', 'date', 'createdAt'];
const POPULATE = [
  { path: 'division', select: 'name zone' },
  { path: 'project', select: 'projectName' },
];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.division) {
    filter.division = query.division;
  } else if (query.zone) {
    const divisions = await divisionRepository.find({ zone: query.zone }, { select: '_id' });
    filter.division = { $in: divisions.map((d) => d._id) };
  }
  if (query.project) filter.project = query.project;
  if (query.search) filter.tenderName = new RegExp(query.search, 'i');

  const { items, total } = await tenderRepository.paginate({ filter, sort, skip, limit: pageSize, populate: POPULATE });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const tender = await tenderRepository.findById(id, { populate: POPULATE });
  if (!tender) throw new ApiError(404, 'Tender not found');
  return tender;
}

async function create(data, files, actorId) {
  const uploadedFiles = await Promise.all((files || []).map((f) => uploadService.uploadCadFile(f)));

  const tender = await tenderRepository.create({
    division: data.division,
    project: data.project || null,
    tenderName: data.tenderName,
    date: data.date,
    files: uploadedFiles,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(tender._id);
}

function parseRemoveIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

async function update(id, data, files, removeFileIdsRaw, actorId) {
  const tender = await tenderRepository.findById(id);
  if (!tender) throw new ApiError(404, 'Tender not found');

  const updates = { updatedBy: actorId };
  if (data.tenderName !== undefined) updates.tenderName = data.tenderName;
  if (data.date !== undefined) updates.date = data.date;
  if (data.division !== undefined) updates.division = data.division;
  if (data.project !== undefined) updates.project = data.project || null;

  const removeIds = new Set(parseRemoveIds(removeFileIdsRaw));
  let remainingFiles = tender.files;

  if (removeIds.size > 0) {
    const toRemove = tender.files.filter((f) => removeIds.has(f.publicId));
    remainingFiles = tender.files.filter((f) => !removeIds.has(f.publicId));
    await Promise.all(toRemove.map((f) => uploadService.deleteAsset(f.publicId, f.resourceType)));
  }

  const newFiles = await Promise.all((files || []).map((f) => uploadService.uploadCadFile(f)));
  updates.files = [...remainingFiles, ...newFiles];

  await tenderRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const tender = await tenderRepository.findById(id);
  if (!tender) throw new ApiError(404, 'Tender not found');

  await Promise.all(tender.files.map((f) => uploadService.deleteAsset(f.publicId, f.resourceType)));
  await tenderRepository.deleteById(id);
}

module.exports = { list, getById, create, update, remove };
