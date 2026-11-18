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

const { buildItemName, qty, resolveItemCatalog, uploadDocs } = require('./stock.listCatalogAndcreateCatalog');

function personKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

async function getBalances(stockItemId, { excludeMovementId } = {}) {
  const itemObjectId = new mongoose.Types.ObjectId(String(stockItemId));
  const match = { stockItem: itemObjectId };
  if (excludeMovementId) {
    match._id = { $ne: new mongoose.Types.ObjectId(String(excludeMovementId)) };
  }
  const rows = await StockMovement.aggregate([
    { $match: match },
    {
      $group: {
        _id: { type: '$type', issuedTo: '$issuedTo' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);

  let inbound = 0;
  let issued = 0;
  let utilized = 0;
  let returned = 0;
  const byPerson = new Map();

  rows.forEach((row) => {
    const type = row._id.type;
    const amount = qty(row.quantity);
    const key = personKey(row._id.issuedTo);

    if (type === SUPPLIER_IN) inbound += amount;
    if (type === ISSUE_OUT) {
      issued += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.issued += amount;
        byPerson.set(key, cur);
      }
    }
    if (type === UTILIZE) {
      utilized += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.utilized += amount;
        byPerson.set(key, cur);
      }
    }
    if (type === RETURN_IN) {
      returned += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.returned += amount;
        byPerson.set(key, cur);
      }
    }
  });

  // Without a separate Issue step: warehouse depletes on Utilize, and returns restore stock.
  const warehouseQty = inbound + returned - utilized;
  const personQtys = {};
  byPerson.forEach((val, key) => {
    personQtys[key] = {
      name: val.name,
      holding: Math.max(0, val.utilized - val.returned),
      issued: val.issued,
      utilized: val.utilized,
      returned: val.returned,
    };
  });

  return { inbound, issued, utilized, returned, warehouseQty, personQtys };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchTerms(search) {
  return String(search || '')
    .trim()
    .split(/[\s/,]+/)
    .map((term) => term.trim())
    .filter((term) => term && term !== '-');
}

function itemTermCondition(term) {
  const regex = new RegExp(escapeRegex(term), 'i');
  return { $or: ITEM_SEARCH_FIELDS.map((field) => ({ [field]: regex })) };
}

async function listItems(query) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: STOCK_MAX_PAGE_SIZE });
  const sort = buildSort(query, ITEM_SORT);
  const filter = {};
  const terms = searchTerms(query.search);
  if (terms.length) {
    filter.$and = terms.map(itemTermCondition);
  }

  const { items, total } = await stockItemRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: ITEM_POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function itemOptions() {
  return stockItemRepository.find(
    {},
    { select: 'name sku unit categoryName componentName subComponentName', sort: { name: 1 } }
  );
}

async function getItemById(id) {
  const item = await stockItemRepository.findById(id, { populate: ITEM_POPULATE });
  if (!item) throw new ApiError(404, 'Stock item not found');
  return item;
}

async function createItem(data, files, actorId) {
  const { category, component, subComponent } = await resolveItemCatalog(data, actorId);
  const itemType = STOCK_ITEM_TYPES.includes(data.itemType) ? data.itemType : STOCK_ITEM_TYPES[0];
  const docs = await uploadDocs(files?.docs || []);

  const created = await stockItemRepository.create({
    category: category?._id || null,
    component: component._id,
    subComponent: subComponent?._id || null,
    categoryName: category?.name || '',
    componentName: component.name,
    subComponentName: subComponent?.name || '',
    name: buildItemName({ category, component, subComponent }),
    sku: String(data.sku || '').trim(),
    unit: String(data.unit || 'Nos').trim() || 'Nos',
    quantity: Math.max(0, Number(data.quantity) || 0),
    amount: Math.max(0, Number(data.amount) || 0),
    totalPiecesSale: Math.max(0, Number(data.totalPiecesSale) || 0),
    itemType,
    salesOrder: String(data.salesOrder || '').trim(),
    description: String(data.description || '').trim(),
    docs,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getItemById(created._id);
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  personKey,
  getBalances,
  escapeRegex,
  searchTerms,
  itemTermCondition,
  listItems,
  itemOptions,
  getItemById,
  createItem,
};
