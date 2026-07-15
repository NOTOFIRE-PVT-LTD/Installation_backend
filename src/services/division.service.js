const divisionRepository = require('../repositories/division.repository');
const tenderRepository = require('../repositories/tender.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['name', 'zone', 'createdAt'];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS, { name: 1 });

  const filter = {};
  if (query.zone) filter.zone = query.zone;
  if (query.search) {
    filter.name = new RegExp(query.search, 'i');
  }

  const { items, total } = await divisionRepository.paginate({ filter, sort, skip, limit: pageSize });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const division = await divisionRepository.findById(id);
  if (!division) throw new ApiError(404, 'Division not found');
  return division;
}

async function create(data, actorId) {
  const existing = await divisionRepository.findOne({ name: data.name });
  if (existing) throw new ApiError(409, 'A division with this name already exists');

  return divisionRepository.create({ name: data.name, zone: data.zone, createdBy: actorId, updatedBy: actorId });
}

async function update(id, data, actorId) {
  if (data.name) {
    const existing = await divisionRepository.findOne({ name: data.name });
    if (existing && existing._id.toString() !== id) {
      throw new ApiError(409, 'A division with this name already exists');
    }
  }

  const division = await divisionRepository.updateById(id, { name: data.name, zone: data.zone, updatedBy: actorId });
  if (!division) throw new ApiError(404, 'Division not found');
  return division;
}

async function remove(id) {
  const division = await divisionRepository.findById(id);
  if (!division) throw new ApiError(404, 'Division not found');

  const tenders = await tenderRepository.find({ division: id });
  await Promise.all(
    tenders.flatMap((tender) =>
      tender.files.map((f) => uploadService.deleteAsset(f.publicId, f.resourceType))
    )
  );
  await tenderRepository.model.deleteMany({ division: id });

  await divisionRepository.deleteById(id);
}

module.exports = { list, getById, create, update, remove };
