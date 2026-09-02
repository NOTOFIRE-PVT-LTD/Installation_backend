const MasterItem = require('../models/MasterItem.model');
const masterItemRepository = require('../repositories/masterItem.repository');
const itemMasterCatalogRepository = require('../repositories/itemMasterCatalog.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { ITEM_MASTER_CATALOG_FIELDS, ITEM_MASTER_CATALOG_KINDS, ITEM_MASTER_ITEM_CATALOG_FIELDS } = require('../config/constants');

const mongoose = require('mongoose');

const OTHER_VALUE = '__other__';

const ITEM_SORT = ['itemName', 'quantity', 'price', 'totalAmount', 'createdAt'];

const ITEM_POPULATE = [
  ...ITEM_MASTER_ITEM_CATALOG_FIELDS.map((field) => ({ path: field, select: 'name kind' })),
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

const LABELS = {
  endUse: 'end use',
  priceGuarantee: 'price guarantee',
  itemCategory: 'item category',
  itemName: 'item name',
  qtyType: 'qty type',
  payment: 'payment',
};

const LEGACY_CATALOG_FIELDS = [ITEM_MASTER_CATALOG_KINDS.END_USE, ITEM_MASTER_CATALOG_KINDS.PRICE_GUARANTEE];

async function migrateItemNameField(item) {
  if (!item?._id) return item;
  const value = item.itemName;
  if (!value) return item;
  if (typeof value === 'string' && (!mongoose.Types.ObjectId.isValid(value) || String(value).length !== 24)) {
    return item;
  }
  let name = '';
  if (typeof value === 'object' && value.name) {
    name = toText(value.name);
  } else {
    const entry = await itemMasterCatalogRepository.findById(value);
    name = toText(entry?.name);
  }
  if (!name) return item;
  await masterItemRepository.updateById(item._id, { itemName: name });
  await findOrCreateCatalog({ kind: ITEM_MASTER_CATALOG_KINDS.ITEM_NAME, name, actorId: null });
  return masterItemRepository.findById(item._id);
}

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

async function migrateLegacyCatalogFields(item) {
  if (!item?._id) return item;
  const updates = {};
  for (const field of LEGACY_CATALOG_FIELDS) {
    const value = item[field];
    if (!value || typeof value !== 'string') continue;
    if (mongoose.Types.ObjectId.isValid(value) && String(value).length === 24) continue;
    const entry = await findOrCreateCatalog({ kind: field, name: value, actorId: null });
    updates[field] = entry._id;
  }
  if (!Object.keys(updates).length) return item;
  await masterItemRepository.updateById(item._id, updates);
  return masterItemRepository.findById(item._id);
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
  for (const field of ITEM_MASTER_ITEM_CATALOG_FIELDS) {
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
      { personAsked: regex },
      { 'location.address': regex },
    ];
  }
  ITEM_MASTER_ITEM_CATALOG_FIELDS.forEach((field) => {
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
  const migratedItems = await Promise.all(
    items.map(async (entry) => {
      const legacy = await migrateLegacyCatalogFields(entry);
      return migrateItemNameField(legacy);
    })
  );
  const populatedItems = await Promise.all(
    migratedItems.map((entry) => masterItemRepository.findById(entry._id, { populate: ITEM_POPULATE }))
  );
  return buildPaginatedResult({ items: populatedItems, total, page, pageSize });
}

async function getItemById(id) {
  const item = await masterItemRepository.findById(id);
  if (!item) throw new ApiError(404, 'Item not found');
  await migrateLegacyCatalogFields(item);
  await migrateItemNameField(item);
  return masterItemRepository.findById(id, { populate: ITEM_POPULATE });
}

function parseLocation(data) {
  if (!data.location) return { latitude: null, longitude: null, address: '' };
  try {
    const parsed = typeof data.location === 'string' ? JSON.parse(data.location) : data.location;
    return {
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      address: toText(parsed.address),
    };
  } catch {
    return { latitude: null, longitude: null, address: '' };
  }
}

async function uploadMasterImage(file) {
  if (!file) return { url: '', publicId: '' };
  return uploadService.uploadImageBuffer(file.buffer);
}

async function deleteMasterImage(image) {
  if (image?.publicId) await uploadService.deleteAsset(image.publicId);
}

function buildPayload(data) {
  const quantity = toNumber(data.quantity, 0);
  const price = toNumber(data.price, 0);
  return {
    personAsked: toText(data.personAsked),
    itemName: toText(data.itemName),
    itemDescription: toText(data.itemDescription),
    quantity,
    price,
    totalAmount: Number((quantity * price).toFixed(2)),
    location: parseLocation(data),
  };
}

async function applyAttachmentUpdates(existing, data, files, update) {
  const itemImage = files?.itemImage?.[0];
  const billPhoto = files?.billPhoto?.[0];
  const visitingCard = files?.visitingCard?.[0];

  if (itemImage) {
    update.image = await uploadMasterImage(itemImage);
    await deleteMasterImage(existing.image);
  } else if (data.removeImage === 'true' || data.removeImage === true) {
    update.image = { url: '', publicId: '' };
    await deleteMasterImage(existing.image);
  }

  if (billPhoto) {
    update.billPhoto = await uploadMasterImage(billPhoto);
    await deleteMasterImage(existing.billPhoto);
  } else if (data.removeBillPhoto === 'true' || data.removeBillPhoto === true) {
    update.billPhoto = { url: '', publicId: '' };
    await deleteMasterImage(existing.billPhoto);
  }

  if (visitingCard) {
    update.visitingCard = await uploadMasterImage(visitingCard);
    await deleteMasterImage(existing.visitingCard);
  } else if (data.removeVisitingCard === 'true' || data.removeVisitingCard === true) {
    update.visitingCard = { url: '', publicId: '' };
    await deleteMasterImage(existing.visitingCard);
  }
}

async function createItem(data, files, actorId) {
  const payload = buildPayload(data);
  if (!payload.itemName) throw new ApiError(400, 'Item name is required');

  const catalog = await resolveCatalogFields(data, actorId);
  if (!catalog[ITEM_MASTER_CATALOG_KINDS.ITEM_CATEGORY]) {
    throw new ApiError(400, 'Item category is required');
  }

  await findOrCreateCatalog({
    kind: ITEM_MASTER_CATALOG_KINDS.ITEM_NAME,
    name: payload.itemName,
    actorId,
  });

  const created = await masterItemRepository.create({
    ...payload,
    ...catalog,
    image: await uploadMasterImage(files?.itemImage?.[0]),
    billPhoto: await uploadMasterImage(files?.billPhoto?.[0]),
    visitingCard: await uploadMasterImage(files?.visitingCard?.[0]),
    isActive: data.isActive === undefined ? true : data.isActive === 'true' || data.isActive === true,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getItemById(created._id);
}

async function updateItem(id, data, files, actorId) {
  const existing = await masterItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Item not found');

  const payload = buildPayload(data);
  if (!payload.itemName) throw new ApiError(400, 'Item name is required');

  const catalog = await resolveCatalogFields(data, actorId);
  if (!catalog[ITEM_MASTER_CATALOG_KINDS.ITEM_CATEGORY]) {
    throw new ApiError(400, 'Item category is required');
  }

  await findOrCreateCatalog({
    kind: ITEM_MASTER_CATALOG_KINDS.ITEM_NAME,
    name: payload.itemName,
    actorId,
  });

  const update = { ...payload, ...catalog, updatedBy: actorId };
  if (data.isActive !== undefined) update.isActive = data.isActive === 'true' || data.isActive === true;

  await applyAttachmentUpdates(existing, data, files, update);
  await masterItemRepository.updateById(id, update);
  return getItemById(id);
}

async function removeItem(id) {
  const existing = await masterItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Item not found');
  await deleteMasterImage(existing.image);
  await deleteMasterImage(existing.billPhoto);
  await deleteMasterImage(existing.visitingCard);
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
