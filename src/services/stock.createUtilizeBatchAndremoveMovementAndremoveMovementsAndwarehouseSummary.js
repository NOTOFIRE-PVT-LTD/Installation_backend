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

const { qty } = require('./stock.listCatalogAndcreateCatalog');
const { getBalances, personKey } = require('./stock.listItemsAnditemOptionsAndgetItemByIdAndcreateItemAndgetBalances');
const { rollbackReceiptTotals } = require('./stock.createMovementAndupdateMovement');

async function removeMovement(id) {
  const movement = await stockMovementRepository.findById(id);
  if (!movement) throw new ApiError(404, 'Stock movement not found');

  const balances = await getBalances(movement.stockItem);
  const amount = qty(movement.quantity);

  if (movement.type === SUPPLIER_IN && amount > balances.warehouseQty) {
    throw new ApiError(400, 'Cannot delete this receipt — warehouse stock has already been utilized');
  }

  if (movement.type === RETURN_IN && amount > balances.warehouseQty) {
    throw new ApiError(400, 'Cannot delete this return — warehouse stock has already been re-utilized');
  }

  if (movement.type === UTILIZE) {
    // Manual utilize has no person assignment. BOM utilizes may still have issuedTo.
    if (movement.issuedTo) {
      const holding = balances.personQtys[personKey(movement.issuedTo)]?.holding || 0;
      if (amount > holding) {
        throw new ApiError(400, 'Cannot delete this utilize — that person has already returned part of it');
      }
    }
  }

  if (movement.type === ISSUE_OUT) {
    const holding = balances.personQtys[personKey(movement.issuedTo)]?.holding || 0;
    if (amount > holding) {
      throw new ApiError(400, 'Cannot delete this issue — that person has already utilized or returned part of it');
    }
  }

  if (movement.type === SUPPLIER_IN) {
    await rollbackReceiptTotals(movement);
  }

  await stockMovementRepository.deleteById(id);
}

async function removeMovements(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  if (!uniqueIds.length) throw new ApiError(400, 'Select at least one stock movement');

  const deleted = [];
  const failed = [];
  for (const id of uniqueIds) {
    try {
      await removeMovement(id);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, message: err.message || 'Failed to delete' });
    }
  }
  return { deleted, failed, requested: uniqueIds.length };
}

async function warehouseSummary() {
  const items = await stockItemRepository.find({}, { sort: { name: 1 } });
  const movements = await StockMovement.aggregate([
    {
      $group: {
        _id: { stockItem: '$stockItem', type: '$type', issuedTo: '$issuedTo' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);

  const byItem = new Map();
  items.forEach((item) => {
    byItem.set(String(item._id), {
      stockItem: item,
      inbound: 0,
      issued: 0,
      utilized: 0,
      returned: 0,
      people: new Map(),
    });
  });

  movements.forEach((row) => {
    const itemId = String(row._id.stockItem);
    const entry = byItem.get(itemId);
    if (!entry) return;
    const amount = qty(row.quantity);
    const type = row._id.type;
    const name = String(row._id.issuedTo || '').trim();
    const key = personKey(name);

    if (type === SUPPLIER_IN) entry.inbound += amount;
    if (type === ISSUE_OUT) {
      entry.issued += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.issued += amount;
        entry.people.set(key, cur);
      }
    }
    if (type === UTILIZE) {
      entry.utilized += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.utilized += amount;
        entry.people.set(key, cur);
      }
    }
    if (type === RETURN_IN) {
      entry.returned += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.returned += amount;
        entry.people.set(key, cur);
      }
    }
  });

  return Array.from(byItem.values()).map((entry) => ({
    _id: entry.stockItem._id,
    name: entry.stockItem.name,
    sku: entry.stockItem.sku,
    unit: entry.stockItem.unit,
    categoryName: entry.stockItem.categoryName,
    componentName: entry.stockItem.componentName,
    subComponentName: entry.stockItem.subComponentName,
    inbound: entry.inbound,
    issued: entry.issued,
    utilized: entry.utilized,
    returned: entry.returned,
    warehouseQty: entry.inbound + entry.returned - entry.utilized,
    people: Array.from(entry.people.values())
      .map((p) => ({
        name: p.name,
        issued: p.issued,
        utilized: p.utilized,
        returned: p.returned,
        holding: Math.max(0, p.utilized - p.returned),
      }))
      .filter((p) => p.holding > 0 || p.utilized > 0 || p.returned > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

async function createUtilizeBatch(lines, actorId, { session } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(400, 'At least one utilize line is required');
  }

  const docs = [];
  for (const line of lines) {
    const item = await stockItemRepository.findById(line.stockItem);
    if (!item) throw new ApiError(404, `Stock item not found: ${line.stockItem}`);

    const quantity = qty(line.quantity);
    if (quantity <= 0) throw new ApiError(400, `Invalid quantity for ${item.name}`);

    const issuedTo = String(line.issuedTo || '').trim();
    if (!issuedTo) throw new ApiError(400, 'Person name is required');

    const balances = await getBalances(item._id);
    if (quantity > balances.warehouseQty) {
      throw new ApiError(
        400,
        `Not enough warehouse stock for ${item.name}. Available: ${balances.warehouseQty} ${item.unit || 'Nos'}, required: ${quantity}`
      );
    }

    docs.push({
      type: UTILIZE,
      stockItem: item._id,
      quantity,
      amount: 0,
      movementDate: line.movementDate || new Date(),
      supplierName: '',
      issuedTo,
      referenceNo: String(line.referenceNo || '').trim(),
      remarks: String(line.remarks || '').trim(),
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  const created = session
    ? await StockMovement.create(docs, { session, ordered: true })
    : await StockMovement.insertMany(docs, { ordered: true });

  return created;
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  removeMovement,
  removeMovements,
  warehouseSummary,
  createUtilizeBatch,
};
