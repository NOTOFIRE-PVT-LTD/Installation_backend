const mongoose = require('mongoose');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const stockItemRepository = require('../repositories/stockItem.repository');
const stockMovementRepository = require('../repositories/stockMovement.repository');
const stockCatalogRepository = require('../repositories/stockCatalog.repository');
const StockMovement = require('../models/StockMovement.model');
const Bom = require('../models/Bom.model');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const {
  STOCK_MOVEMENT_TYPES,
  STOCK_CATALOG_KINDS,
  STOCK_ITEM_TYPES,
  DEFAULT_STOCK_COMPONENT_NAMES,
} = require('../config/constants');

const STOCK_MAX_PAGE_SIZE = 1000;
const ITEM_SORT = ['name', 'sku', 'unit', 'categoryName', 'quantity', 'amount', 'createdAt'];
const MOVEMENT_SORT = ['movementDate', 'quantity', 'type', 'createdAt'];

const ITEM_POPULATE = [
  { path: 'category', select: 'name kind' },
  { path: 'component', select: 'name kind parent' },
  { path: 'subComponent', select: 'name kind parent' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

const OTHER_VALUE = '__other__';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isOther(value) {
  return !value || String(value) === OTHER_VALUE;
}

async function findOrCreateCatalog({ kind, name, parent, actorId }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new ApiError(400, 'Name is required');
  const filter = {
    kind,
    parent: parent || null,
    name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
  };
  const existing = await stockCatalogRepository.findOne(filter);
  if (existing) return existing;
  return stockCatalogRepository.create({
    kind,
    name: trimmed,
    parent: parent || null,
    createdBy: actorId,
  });
}

async function resolveCatalogEntry({ kind, id, otherName, parent, actorId, label }) {
  if (!isOther(id)) {
    const entry = await stockCatalogRepository.findById(id);
    if (!entry || entry.kind !== kind) throw new ApiError(400, `Invalid ${label}`);
    if (parent && String(entry.parent || '') !== String(parent)) {
      throw new ApiError(400, `${label} does not belong to the selected parent`);
    }
    return entry;
  }
  const created = await findOrCreateCatalog({ kind, name: otherName, parent, actorId });
  return created;
}

let seededComponentCount = -1;

function sortCatalog(items, preferredNames = []) {
  const index = new Map(preferredNames.map((name, i) => [String(name).toLowerCase(), i]));
  return [...items].sort((a, b) => {
    const ai = index.has(String(a.name).toLowerCase()) ? index.get(String(a.name).toLowerCase()) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(String(b.name).toLowerCase()) ? index.get(String(b.name).toLowerCase()) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a.name).localeCompare(String(b.name));
  });
}

async function ensureDefaultStockComponents() {
  if (seededComponentCount === DEFAULT_STOCK_COMPONENT_NAMES.length) return;
  for (const name of DEFAULT_STOCK_COMPONENT_NAMES) {
    await findOrCreateCatalog({
      kind: STOCK_CATALOG_KINDS.COMPONENT,
      name,
      parent: null,
    });
  }
  seededComponentCount = DEFAULT_STOCK_COMPONENT_NAMES.length;
}

async function listCatalog(query) {
  const kind = query.kind;
  if (!Object.values(STOCK_CATALOG_KINDS).includes(kind)) {
    throw new ApiError(400, 'Invalid catalog kind');
  }
  if (kind === STOCK_CATALOG_KINDS.COMPONENT) {
    await ensureDefaultStockComponents();
    const filter = { kind };
    // Without a parent filter, return all components so the form can work without category.
    if (query.parent) {
      filter.$or = [{ parent: null }, { parent: query.parent }];
    }
    const items = await stockCatalogRepository.find(filter, { sort: { name: 1 } });
    return sortCatalog(items, DEFAULT_STOCK_COMPONENT_NAMES);
  }
  const filter = { kind };
  if (kind === STOCK_CATALOG_KINDS.CATEGORY) {
    filter.parent = null;
  } else if (query.parent) {
    filter.parent = query.parent;
  } else {
    return [];
  }
  return stockCatalogRepository.find(filter, { sort: { name: 1 } });
}

async function createCatalog(data, actorId) {
  const kind = data.kind;
  if (!Object.values(STOCK_CATALOG_KINDS).includes(kind)) {
    throw new ApiError(400, 'Invalid catalog kind');
  }
  let parent = null;
  if (kind === STOCK_CATALOG_KINDS.COMPONENT && data.parent) {
    const category = await stockCatalogRepository.findById(data.parent);
    if (!category || category.kind !== STOCK_CATALOG_KINDS.CATEGORY) {
      throw new ApiError(400, 'Valid category is required');
    }
    parent = category._id;
  }
  if (kind === STOCK_CATALOG_KINDS.SUB_COMPONENT) {
    if (!data.parent) throw new ApiError(400, 'Component is required');
    const component = await stockCatalogRepository.findById(data.parent);
    if (!component || component.kind !== STOCK_CATALOG_KINDS.COMPONENT) {
      throw new ApiError(400, 'Valid component is required');
    }
    parent = component._id;
  }
  return findOrCreateCatalog({ kind, name: data.name, parent, actorId });
}

async function resolveItemCatalog(data, actorId) {
  // Category is optional — form flow is Component → Sub Component only.
  const hasCategory =
    Boolean(String(data.category || '').trim()) ||
    Boolean(String(data.newCategory || data.categoryName || '').trim());
  const category = hasCategory
    ? await resolveCatalogEntry({
        kind: STOCK_CATALOG_KINDS.CATEGORY,
        id: data.category || OTHER_VALUE,
        otherName: data.newCategory || data.categoryName,
        actorId,
        label: 'component category',
      })
    : null;
  const component = await resolveCatalogEntry({
    kind: STOCK_CATALOG_KINDS.COMPONENT,
    id: data.component,
    otherName: data.newComponent || data.componentName,
    actorId,
    label: 'component name',
  });
  // Sub component is optional — the item then belongs directly to the component.
  const subComponentName = data.newSubComponent || data.subComponentName;
  const hasSubComponent = isOther(data.subComponent)
    ? Boolean(String(subComponentName || '').trim())
    : Boolean(String(data.subComponent || '').trim());
  const subComponent = hasSubComponent
    ? await resolveCatalogEntry({
        kind: STOCK_CATALOG_KINDS.SUB_COMPONENT,
        id: data.subComponent,
        otherName: subComponentName,
        parent: component._id,
        actorId,
        label: 'sub component name',
      })
    : null;
  return { category, component, subComponent };
}

function buildItemName({ category, component, subComponent }) {
  return subComponent?.name || component?.name || category?.name || '';
}

async function uploadDocs(files = []) {
  return Promise.all((files || []).map((file) => uploadService.uploadCadFile(file)));
}

function parseRemoveDocIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
}

function qty(n) {
  return Math.max(0, Number(n) || 0);
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  escapeRegex,
  isOther,
  findOrCreateCatalog,
  resolveCatalogEntry,
  seededComponentCount,
  sortCatalog,
  ensureDefaultStockComponents,
  listCatalog,
  createCatalog,
  resolveItemCatalog,
  buildItemName,
  uploadDocs,
  parseRemoveDocIds,
  qty,
};
