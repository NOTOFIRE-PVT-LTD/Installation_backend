const mongoose = require('mongoose');
const bomRepository = require('../repositories/bom.repository');
const bomProductionRepository = require('../repositories/bomProduction.repository');
const stockItemRepository = require('../repositories/stockItem.repository');
const stockService = require('./stock.service');
const BomProduction = require('../models/BomProduction.model');
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
  return getBomById(id);
}

async function removeBom(id) {
  const existing = await bomRepository.findById(id);
  if (!existing) throw new ApiError(404, 'BOM not found');
  const productionCount = await bomProductionRepository.countDocuments({ bom: id });
  if (productionCount > 0) {
    throw new ApiError(400, 'Cannot delete BOM that already has production records. Mark it inactive instead.');
  }
  await bomRepository.deleteById(id);
}

async function previewProduction(data) {
  const bom = await getBomById(data.bom);
  if (!bom.isActive) throw new ApiError(400, 'Cannot use an inactive BOM');
  if (!bom.components?.length) throw new ApiError(400, 'BOM has no components');

  const productionQty = qty(data.productionQty);
  if (productionQty <= 0) throw new ApiError(400, 'Production quantity must be greater than 0');

  const lines = [];
  let hasShortage = false;
  for (const component of bom.components) {
    const item = component.stockItem?._id ? component.stockItem : await stockItemRepository.findById(component.stockItem);
    if (!item) throw new ApiError(404, 'BOM component item not found');
    const balances = await stockService.getBalances(item._id || component.stockItem);
    const qtyPerPcs = qty(component.qtyPerPcs);
    const requiredQty = qtyPerPcs * productionQty;
    const availableQty = balances.warehouseQty;
    const shortage = Math.max(0, requiredQty - availableQty);
    if (shortage > 0) hasShortage = true;
    lines.push({
      stockItem: item._id || component.stockItem,
      itemName: itemDisplayName(item),
      partNo: item.sku || '',
      qtyPerPcs,
      productionQty,
      requiredQty,
      availableQty,
      shortage,
      unit: item.unit || 'Nos',
    });
  }

  return {
    bom: {
      _id: bom._id,
      name: bom.name,
      version: bom.version,
    },
    productionQty,
    hasShortage,
    canConfirm: !hasShortage,
    lines,
  };
}

async function confirmProduction(data, actorId) {
  const person = String(data.person || '').trim();
  if (!person) throw new ApiError(400, 'Person name is required');

  const preview = await previewProduction(data);
  if (!preview.canConfirm) {
    throw new ApiError(400, 'Insufficient warehouse stock for one or more BOM components');
  }

  const bom = await getBomById(data.bom);
  const productionDate = data.productionDate || new Date();
  const referenceNo = String(data.referenceNo || '').trim();
  const remarks = String(data.remarks || '').trim();

  const session = await mongoose.startSession();
  let useTransaction = true;
  try {
    session.startTransaction();
  } catch {
    useTransaction = false;
  }

  try {
    const utilizeLines = preview.lines.map((line) => ({
      stockItem: line.stockItem,
      quantity: line.requiredQty,
      issuedTo: person,
      movementDate: productionDate,
      referenceNo,
      remarks: remarks || `BOM production: ${bom.name} v${bom.version} × ${preview.productionQty}`,
    }));

    const movements = await stockService.createUtilizeBatch(utilizeLines, actorId, {
      session: useTransaction ? session : undefined,
    });

    let production;
    if (useTransaction) {
      const created = await BomProduction.create(
        [
          {
            bom: bom._id,
            bomName: bom.name,
            bomVersion: bom.version,
            productionQty: preview.productionQty,
            person,
            productionDate,
            referenceNo,
            remarks,
            lines: preview.lines.map((line) => ({
              stockItem: line.stockItem,
              itemName: line.itemName,
              qtyPerPcs: line.qtyPerPcs,
              requiredQty: line.requiredQty,
              availableQty: line.availableQty,
              unit: line.unit,
            })),
            movements: movements.map((m) => m._id),
            createdBy: actorId,
          },
        ],
        { session }
      );
      production = created[0];
      await session.commitTransaction();
    } else {
      production = await bomProductionRepository.create({
        bom: bom._id,
        bomName: bom.name,
        bomVersion: bom.version,
        productionQty: preview.productionQty,
        person,
        productionDate,
        referenceNo,
        remarks,
        lines: preview.lines.map((line) => ({
          stockItem: line.stockItem,
          itemName: line.itemName,
          qtyPerPcs: line.qtyPerPcs,
          requiredQty: line.requiredQty,
          availableQty: line.availableQty,
          unit: line.unit,
        })),
        movements: movements.map((m) => m._id),
        createdBy: actorId,
      });
    }

    return bomProductionRepository.findById(production._id, { populate: PRODUCTION_POPULATE });
  } catch (err) {
    if (useTransaction) {
      try {
        await session.abortTransaction();
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    session.endSession();
  }
}

async function listProductions(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, PRODUCTION_SORT);
  const filter = {};
  if (query.bom) filter.bom = query.bom;
  if (query.person) filter.person = new RegExp(String(query.person).trim(), 'i');
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ bomName: regex }, { person: regex }, { referenceNo: regex }, { remarks: regex }];
  }

  const { items, total } = await bomProductionRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: PRODUCTION_POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getProductionById(id) {
  const production = await bomProductionRepository.findById(id, { populate: PRODUCTION_POPULATE });
  if (!production) throw new ApiError(404, 'BOM production not found');
  return production;
}

module.exports = {
  listBoms,
  getBomById,
  createBom,
  updateBom,
  removeBom,
  previewProduction,
  confirmProduction,
  listProductions,
  getProductionById,
};
