const mongoose = require('mongoose');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const bomRepository = require('../repositories/bom.repository');
const bomProductionRepository = require('../repositories/bomProduction.repository');
const stockItemRepository = require('../repositories/stockItem.repository');
const stockService = require('./stock.service');
const BomProduction = require('../models/BomProduction.model');
const StockMovement = require('../models/StockMovement.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const BOM_SORT = ['name', 'version', 'effectiveDate', 'isActive', 'createdAt'];
const PRODUCTION_SORT = ['productionDate', 'productionQty', 'person', 'createdAt'];

const BOM_POPULATE = [
  { path: 'finishedItem', select: 'name sku unit categoryName componentName subComponentName' },
  { path: 'components.stockItem', select: 'name sku unit categoryName componentName subComponentName' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

const PRODUCTION_POPULATE = [
  { path: 'bom', select: 'name version' },
  { path: 'lines.stockItem', select: 'name sku unit' },
  { path: 'movements', select: 'type quantity stockItem issuedTo movementDate' },
  { path: 'createdBy', select: 'name email' },
];

function qty(n) {
  return Math.max(0, Number(n) || 0);
}

function itemDisplayName(item) {
  if (!item) return '-';
  return (
    [item.categoryName, item.componentName, item.subComponentName || item.name].filter(Boolean).join(' / ') ||
    item.name ||
    '-'
  );
}

async function normalizeComponents(components = []) {
  if (!Array.isArray(components)) return [];
  const normalized = [];
  for (const row of components) {
    if (!row?.stockItem) throw new ApiError(400, 'Each BOM component must have an item');
    const item = await stockItemRepository.findById(row.stockItem);
    if (!item) throw new ApiError(404, `Stock item not found: ${row.stockItem}`);
    const qtyPerPcs = qty(row.qtyPerPcs);
    if (qtyPerPcs <= 0) throw new ApiError(400, `Qty required for 1 PCS must be greater than 0 for ${item.name}`);
    normalized.push({
      stockItem: item._id,
      qtyPerPcs,
      unit: String(row.unit || '').trim() || item.unit || 'Nos',
    });
  }
  return normalized;
}

async function listBoms(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, BOM_SORT);
  const filter = {};
  if (query.isActive === 'true') filter.isActive = true;
  if (query.isActive === 'false') filter.isActive = false;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ name: regex }, { version: regex }, { remarks: regex }];
  }

  const { items, total } = await bomRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: BOM_POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getBomById(id) {
  const bom = await bomRepository.findById(id, { populate: BOM_POPULATE });
  if (!bom) throw new ApiError(404, 'BOM not found');
  return bom;
}

async function createBom(data, actorId) {
  const name = String(data.name || '').trim();
  if (!name) throw new ApiError(400, 'BOM name is required');

  const components = await normalizeComponents(data.components || []);
  if (components.length === 0) {
    throw new ApiError(400, 'BOM must have at least one component');
  }

  let finishedItem = null;
  if (data.finishedItem) {
    finishedItem = await stockItemRepository.findById(data.finishedItem);
    if (!finishedItem) throw new ApiError(404, 'Finished item not found');
  }

  const created = await bomRepository.create({
    name,
    finishedItem: finishedItem?._id || null,
    version: String(data.version || '1.0').trim() || '1.0',
    effectiveDate: data.effectiveDate || new Date(),
    remarks: String(data.remarks || '').trim(),
    isActive: data.isActive !== false && data.isActive !== 'false',
    components,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getBomById(created._id);
}

async function updateBom(id, data, actorId) {
  const existing = await bomRepository.findById(id);
  if (!existing) throw new ApiError(404, 'BOM not found');

  let components = existing.components;
  if (data.components !== undefined) {
    components = await normalizeComponents(data.components || []);
  }
  if (!components || components.length === 0) {
    throw new ApiError(400, 'BOM must have at least one component');
  }

  let finishedItemId = existing.finishedItem;
  if (data.finishedItem !== undefined) {
    if (!data.finishedItem) {
      finishedItemId = null;
    } else {
      const finishedItem = await stockItemRepository.findById(data.finishedItem);
      if (!finishedItem) throw new ApiError(404, 'Finished item not found');
      finishedItemId = finishedItem._id;
    }
  }

  const name = data.name !== undefined ? String(data.name || '').trim() : existing.name;
  if (!name) throw new ApiError(400, 'BOM name is required');

  // Compare against production lines too, so components removed before this sync existed are caught.
  const remainingItemIds = new Set(components.map((component) => String(component.stockItem)));
  const productionItemIds = await BomProduction.distinct('lines.stockItem', { bom: existing._id });
  const removedItemIds = [
    ...new Set(
      [...(existing.components || []).map((component) => component.stockItem), ...productionItemIds]
        .map(String)
        .filter((itemId) => mongoose.Types.ObjectId.isValid(itemId) && !remainingItemIds.has(itemId))
    ),
  ];

  const { applyComponentRemoval, removeComponentsFromProductions } = require('./bom.removeBomAndpreviewProduction');
  const removal = await removeComponentsFromProductions(id, removedItemIds);

  await bomRepository.updateById(id, {
    name,
    finishedItem: finishedItemId,
    version: data.version !== undefined ? String(data.version || '1.0').trim() || '1.0' : existing.version,
    effectiveDate: data.effectiveDate !== undefined ? data.effectiveDate || existing.effectiveDate : existing.effectiveDate,
    remarks: data.remarks !== undefined ? String(data.remarks || '').trim() : existing.remarks,
    isActive:
      data.isActive !== undefined ? data.isActive !== false && data.isActive !== 'false' : existing.isActive,
    components,
    updatedBy: actorId,
  });
  const adjustedProductions = removal.productions.length ? await applyComponentRemoval(removal) : 0;
  const updatedBom = await getBomById(id);
  const extendedProductions = await addComponentsToProductions(updatedBom);
  return { bom: updatedBom, adjustedProductions, extendedProductions };
}

async function addComponentsToProductions(bom) {
  const components = (bom.components || []).filter((component) => component.stockItem?._id);
  if (!components.length) return 0;

  const productions = await BomProduction.find({ bom: bom._id });
  let extended = 0;
  for (const production of productions) {
    const existingItemIds = new Set(production.lines.map((line) => String(line.stockItem)));
    const missing = components.filter((component) => !existingItemIds.has(String(component.stockItem._id)));
    if (!missing.length) continue;

    const productionQty = qty(production.productionQty);
    for (const component of missing) {
      const item = component.stockItem;
      const qtyPerPcs = qty(component.qtyPerPcs);
      const requiredQty = qtyPerPcs * productionQty;
      const balances = await stockService.getBalances(item._id);
      production.lines.push({
        stockItem: item._id,
        itemName: itemDisplayName(item),
        qtyPerPcs,
        requiredQty,
        availableQty: balances.warehouseQty,
        issuedQty: 0,
        pendingQty: requiredQty,
        unit: String(component.unit || '').trim() || item.unit || 'Nos',
      });
    }
    production.status = 'pending';
    production.markModified('lines');
    await production.save();
    extended += 1;
  }
  return extended;
}

function personKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

module.exports = {
  BOM_SORT,
  PRODUCTION_SORT,
  BOM_POPULATE,
  PRODUCTION_POPULATE,
  qty,
  itemDisplayName,
  normalizeComponents,
  listBoms,
  getBomById,
  createBom,
  updateBom,
  addComponentsToProductions,
  personKey,
};
