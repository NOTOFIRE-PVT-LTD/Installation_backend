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
const { getMovementById } = require('./stock.updateItemAndremoveItemAndremoveItemsAndlistMovementsAndgetMovementById');

async function createMovement(data, actorId) {
  const type = data.type;
  if (!Object.values(STOCK_MOVEMENT_TYPES).includes(type)) {
    throw new ApiError(400, 'Invalid movement type');
  }

  const item = await stockItemRepository.findById(data.stockItem);
  if (!item) throw new ApiError(404, 'Stock item not found');

  const quantity = qty(data.quantity);
  if (quantity <= 0) throw new ApiError(400, 'Quantity must be greater than 0');

  const issuedTo = String(data.issuedTo || '').trim();
  const balances = await getBalances(item._id);

  if (type === SUPPLIER_IN && !String(data.supplierName || '').trim()) {
    throw new ApiError(400, 'Supplier name is required');
  }

  const movementAmount = qty(data.amount);
  if (type === SUPPLIER_IN && (data.amount === undefined || data.amount === null || String(data.amount).trim() === '')) {
    throw new ApiError(400, 'Amount is required');
  }
  if (type !== SUPPLIER_IN && data.amount !== undefined && Number(data.amount) > 0) {
    throw new ApiError(400, 'Amount is only allowed for supplier receipts');
  }

  if (type === ISSUE_OUT) {
    if (!issuedTo) throw new ApiError(400, 'Person name is required');
    if (quantity > balances.warehouseQty) {
      throw new ApiError(400, `Not enough warehouse stock. Available: ${balances.warehouseQty} ${item.unit}`);
    }
  }

  if (type === UTILIZE) {
    if (quantity > balances.warehouseQty) {
      throw new ApiError(400, `Not enough warehouse stock. Available: ${balances.warehouseQty} ${item.unit}`);
    }
  }

  if (type === RETURN_IN) {
    if (!issuedTo) throw new ApiError(400, 'Person name is required');
    const holding = balances.personQtys[personKey(issuedTo)]?.holding || 0;
    if (quantity > holding) {
      throw new ApiError(
        400,
        `Not enough stock with ${issuedTo}. Holding: ${holding} ${item.unit}`
      );
    }
  }

  const created = await stockMovementRepository.create({
    type,
    stockItem: item._id,
    quantity,
    unit: String(data.unit || '').trim() || item.unit || 'Nos',
    amount: type === SUPPLIER_IN ? movementAmount : 0,
    movementDate: data.movementDate || new Date(),
    supplierName: type === SUPPLIER_IN ? String(data.supplierName || '').trim() : '',
    issuedTo: type === SUPPLIER_IN || type === UTILIZE ? '' : issuedTo,
    referenceNo: String(data.referenceNo || '').trim(),
    remarks: String(data.remarks || '').trim(),
    createdBy: actorId,
    updatedBy: actorId,
  });

  if (type === SUPPLIER_IN) {
    await stockItemRepository.updateById(item._id, {
      quantity: qty(item.quantity) + quantity,
      amount: qty(item.amount) + movementAmount,
    });
  }

  return getMovementById(created._id);
}

async function updateMovement(id, data, actorId) {
  const existing = await stockMovementRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Stock movement not found');

  const type = existing.type;
  const item = await stockItemRepository.findById(
    data.stockItem !== undefined && data.stockItem ? data.stockItem : existing.stockItem
  );
  if (!item) throw new ApiError(404, 'Stock item not found');

  const quantity = data.quantity !== undefined ? qty(data.quantity) : qty(existing.quantity);
  if (quantity <= 0) throw new ApiError(400, 'Quantity must be greater than 0');

  const issuedTo =
    data.issuedTo !== undefined ? String(data.issuedTo || '').trim() : String(existing.issuedTo || '').trim();
  const supplierName =
    data.supplierName !== undefined
      ? String(data.supplierName || '').trim()
      : String(existing.supplierName || '').trim();

  if (type === SUPPLIER_IN && !supplierName) throw new ApiError(400, 'Supplier name is required');
  if ((type === ISSUE_OUT || type === RETURN_IN) && !issuedTo) {
    throw new ApiError(400, 'Person name is required');
  }

  const movementAmount = data.amount !== undefined ? qty(data.amount) : qty(existing.amount);
  if (type !== SUPPLIER_IN && movementAmount > 0) {
    throw new ApiError(400, 'Amount is only allowed for supplier receipts');
  }

  // Balances as they would be if this movement did not exist.
  const balances = await getBalances(item._id, { excludeMovementId: existing._id });

  if (type === SUPPLIER_IN && balances.warehouseQty + quantity < 0) {
    throw new ApiError(
      400,
      `Cannot reduce this receipt to ${quantity} — ${Math.abs(balances.warehouseQty)} ${item.unit} has already been utilized`
    );
  }

  if ((type === ISSUE_OUT || type === UTILIZE) && quantity > balances.warehouseQty) {
    throw new ApiError(400, `Not enough warehouse stock. Available: ${balances.warehouseQty} ${item.unit}`);
  }

  if (type === RETURN_IN) {
    const holding = balances.personQtys[personKey(issuedTo)]?.holding || 0;
    if (quantity > holding) {
      throw new ApiError(400, `Not enough stock with ${issuedTo}. Holding: ${holding} ${item.unit}`);
    }
  }

  await stockMovementRepository.updateById(id, {
    stockItem: item._id,
    quantity,
    unit:
      (data.unit !== undefined ? String(data.unit || '').trim() : String(existing.unit || '').trim()) ||
      item.unit ||
      'Nos',
    amount: type === SUPPLIER_IN ? movementAmount : 0,
    movementDate: data.movementDate || existing.movementDate,
    supplierName: type === SUPPLIER_IN ? supplierName : '',
    issuedTo: type === SUPPLIER_IN || type === UTILIZE ? '' : issuedTo,
    referenceNo: data.referenceNo !== undefined ? String(data.referenceNo || '').trim() : existing.referenceNo,
    remarks: data.remarks !== undefined ? String(data.remarks || '').trim() : existing.remarks,
    updatedBy: actorId,
  });

  if (type === SUPPLIER_IN) {
    await rollbackReceiptTotals(existing);
    const target = await stockItemRepository.findById(item._id);
    if (target) {
      await stockItemRepository.updateById(target._id, {
        quantity: qty(target.quantity) + quantity,
        amount: qty(target.amount) + movementAmount,
      });
    }
  }

  return getMovementById(id);
}

async function rollbackReceiptTotals(movement) {
  const item = await stockItemRepository.findById(movement.stockItem);
  if (!item) return;
  await stockItemRepository.updateById(item._id, {
    quantity: Math.max(0, qty(item.quantity) - qty(movement.quantity)),
    amount: Math.max(0, qty(item.amount) - qty(movement.amount)),
  });
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  createMovement,
  updateMovement,
  rollbackReceiptTotals,
};
