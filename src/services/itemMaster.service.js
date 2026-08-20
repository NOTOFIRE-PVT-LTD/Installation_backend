const MasterItem = require('../models/MasterItem.model');
const masterItemRepository = require('../repositories/masterItem.repository');
const itemMasterCatalogRepository = require('../repositories/itemMasterCatalog.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { ITEM_MASTER_CATALOG_FIELDS, ITEM_MASTER_CATALOG_KINDS } = require('../config/constants');

const OTHER_VALUE = '__other__';

const ITEM_SORT = ['itemName', 'quantity', 'price', 'totalAmount', 'createdAt'];

const ITEM_POPULATE = [
  ...ITEM_MASTER_CATALOG_FIELDS.map((field) => ({ path: field, select: 'name kind' })),
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

const LABELS = {
  itemCategory: 'item category',
  qtyType: 'qty type',
  payment: 'payment',
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value) {
  return String(value ?? '').trim();
}

function newNameField(field) {
  return `new${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

async function findOrCreateCatalog({ kind, name, actorId }) {
  const trimmed = toText(name);
  if (!trimmed) throw new ApiError(400, 'Name is required');
  const existing = await itemMasterCatalogRepository.findOne({ kind, name: exactRegex(trimmed) });
  if (existing) return existing;
  return itemMasterCatalogRepository.create({ kind, name: trimmed, createdBy: actorId || null });
}

async function listCatalog(query) {
  const { kind } = query;
  if (!ITEM_MASTER_CATALOG_FIELDS.includes(kind)) throw new ApiError(400, 'Invalid catalog kind');
  return itemMasterCatalogRepository.find({ kind }, { sort: { name: 1 } });
}

async function createCatalog(data, actorId) {
  const { kind } = data;
  if (!ITEM_MASTER_CATALOG_FIELDS.includes(kind)) throw new ApiError(400, 'Invalid catalog kind');
  return findOrCreateCatalog({ kind, name: data.name, actorId });
}

async function removeCatalog(id) {
  const entry = await itemMasterCatalogRepository.findById(id);
  if (!entry) throw new ApiError(404, 'Catalog entry not found');
  await MasterItem.updateMany({ [entry.kind]: entry._id }, { $unset: { [entry.kind]: 1 } });
  await itemMasterCatalogRepository.deleteById(id);
  return { _id: id, kind: entry.kind };
}

// Each dropdown accepts either an existing catalog id or the "Others" sentinel paired
// with a `new<Field>` name, which is created on the fly.
async function resolveCatalogFields(data, actorId) {
  const resolved = {};
  for (const field of ITEM_MASTER_CATALOG_FIELDS) {
    const raw = data[field];
    const typedName = toText(data[newNameField(field)]);

    if (String(raw) === OTHER_VALUE || (!raw && typedName)) {
      if (!typedName) {
        resolved[field] = null;
        continue;
      }
      const created = await findOrCreateCatalog({ kind: field, name: typedName, actorId });
      resolved[field] = created._id;
      continue;
    }

    if (!raw) {
      resolved[field] = null;
      continue;
    }

    const entry = await itemMasterCatalogRepository.findById(raw);
    if (!entry || entry.kind !== field) throw new ApiError(400, `Invalid ${LABELS[field] || field}`);
    resolved[field] = entry._id;
  }
  return resolved;
}

async function listItems(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ITEM_SORT);
  const filter = {};

  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { itemName: regex },
      { itemDescription: regex },
      { endUse: regex },
      { personAsked: regex },
      { priceGuarantee: regex },
    ];
  }
  ITEM_MASTER_CATALOG_FIELDS.forEach((field) => {
    if (query[field]) filter[field] = query[field];
  });
  if (query.isActive === 'true' || query.isActive === 'false') {
    filter.isActive = query.isActive === 'true';
  }

  const { items, total } = await masterItemRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: ITEM_POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getItemById(id) {
  const item = await masterItemRepository.findById(id, { populate: ITEM_POPULATE });
  if (!item) throw new ApiError(404, 'Item not found');
  return item;
}

function buildPayload(data) {
  const quantity = toNumber(data.quantity, 0);
  const price = toNumber(data.price, 0);
  return {
    endUse: toText(data.endUse),
    personAsked: toText(data.personAsked),
    priceGuarantee: toText(data.priceGuarantee),
    itemName: toText(data.itemName),
    itemDescription: toText(data.itemDescription),
    quantity,
    price,
    totalAmount: Number((quantity * price).toFixed(2)),
  };
}

async function createItem(data, file, actorId) {
  const payload = buildPayload(data);
  if (!payload.itemName) throw new ApiError(400, 'Item name is required');

  const catalog = await resolveCatalogFields(data, actorId);
  if (!catalog[ITEM_MASTER_CATALOG_KINDS.ITEM_CATEGORY]) {
    throw new ApiError(400, 'Item category is required');
  }

  const image = file ? await uploadService.uploadImageBuffer(file.buffer) : { url: '', publicId: '' };

  const created = await masterItemRepository.create({
    ...payload,
    ...catalog,
    image,
    isActive: data.isActive === undefined ? true : data.isActive === 'true' || data.isActive === true,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getItemById(created._id);
}

async function updateItem(id, data, file, actorId) {
  const existing = await masterItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Item not found');

  const payload = buildPayload(data);
  if (!payload.itemName) throw new ApiError(400, 'Item name is required');

  const catalog = await resolveCatalogFields(data, actorId);
  if (!catalog[ITEM_MASTER_CATALOG_KINDS.ITEM_CATEGORY]) {
    throw new ApiError(400, 'Item category is required');
  }

  const update = { ...payload, ...catalog, updatedBy: actorId };
  if (data.isActive !== undefined) update.isActive = data.isActive === 'true' || data.isActive === true;

  const removeImage = data.removeImage === 'true' || data.removeImage === true;
  if (file) {
    update.image = await uploadService.uploadImageBuffer(file.buffer);
    await uploadService.deleteAsset(existing.image?.publicId);
  } else if (removeImage) {
    update.image = { url: '', publicId: '' };
    await uploadService.deleteAsset(existing.image?.publicId);
  }

  await masterItemRepository.updateById(id, update);
  return getItemById(id);
}

async function removeItem(id) {
  const existing = await masterItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Item not found');
  await uploadService.deleteAsset(existing.image?.publicId);
  await masterItemRepository.deleteById(id);
  return { _id: id };
}

module.exports = {
  listCatalog,
  createCatalog,
  removeCatalog,
  listItems,
  getItemById,
  createItem,
  updateItem,
  removeItem,
};
