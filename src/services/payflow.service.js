const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { PAYFLOW_RESOURCES } = require('../config/payflow.config');

function getConfig(resource) {
  const config = PAYFLOW_RESOURCES[resource];
  if (!config) throw new ApiError(404, 'Unknown payflow resource');
  return config;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickData(config, data) {
  const out = {};
  Object.entries(config.fields).forEach(([key, spec]) => {
    if (data[key] === undefined) return;
    let value = String(data[key]).trim();
    if (spec.uppercase) value = value.toUpperCase();
    out[key] = value;
  });
  return out;
}

async function assertUnique(config, data, excludeId) {
  for (const field of config.unique) {
    if (!data[field]) continue;
    const existing = await config.model.findOne({ [field]: data[field] });
    if (existing && existing._id.toString() !== excludeId) {
      throw new ApiError(409, `A ${config.label.toLowerCase()} with this ${config.fields[field].label.toLowerCase()} already exists`);
    }
  }
}

async function list(resource, query) {
  const config = getConfig(resource);
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ['createdAt', ...Object.keys(config.fields)], { createdAt: -1 });

  const filter = {};
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = config.searchFields.map((field) => ({ [field]: regex }));
  }

  const [items, total] = await Promise.all([
    config.model.find(filter).sort(sort).skip(skip).limit(pageSize).exec(),
    config.model.countDocuments(filter),
  ]);
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(resource, id) {
  const config = getConfig(resource);
  const doc = await config.model.findById(id);
  if (!doc) throw new ApiError(404, `${config.label} not found`);
  return doc;
}

async function create(resource, body, actorId) {
  const config = getConfig(resource);
  const data = pickData(config, body);
  await assertUnique(config, data);
  return config.model.create({ ...data, createdBy: actorId, updatedBy: actorId });
}

async function update(resource, id, body, actorId) {
  const config = getConfig(resource);
  const data = pickData(config, body);
  await assertUnique(config, data, id);
  const doc = await config.model.findByIdAndUpdate(id, { ...data, updatedBy: actorId }, { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, `${config.label} not found`);
  return doc;
}

async function remove(resource, id) {
  const config = getConfig(resource);
  const doc = await config.model.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, `${config.label} not found`);
}

module.exports = { list, getById, create, update, remove };
