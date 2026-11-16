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
const { createMovement } = require('./stock.createMovementAndupdateMovement');
const { findStockItemForReceive, parseReceiveWorkbook } = require('./stock.buildReceiveImportTemplate');

async function bulkImportReceives(file, actorId) {
  const rows = await parseReceiveWorkbook(file);
  if (!rows.length) throw new ApiError(400, 'No valid rows found in the uploaded file');

  const items = await stockItemRepository.find(
    {},
    { select: 'name sku unit componentName subComponentName quantity amount' }
  );

  let inserted = 0;
  const failed = [];

  for (const row of rows) {
    try {
      if (!row.supplierName) throw new ApiError(400, 'Supplier name is required');
      if (row.amountEmpty) throw new ApiError(400, 'Amount is required');
      if (row.quantity <= 0) throw new ApiError(400, 'Quantity must be greater than 0');

      const item = findStockItemForReceive(items, row);
      if (!item) {
        throw new ApiError(
          400,
          `Stock item not found for "${row.componentName || row.stockItemLabel}${
            row.subComponentName ? ` / ${row.subComponentName}` : ''
          }". Add it in Items first.`
        );
      }

      await createMovement(
        {
          type: SUPPLIER_IN,
          stockItem: item._id,
          supplierName: row.supplierName,
          amount: row.amount,
          quantity: row.quantity,
          unit: row.unit,
          movementDate: row.movementDate,
          referenceNo: row.referenceNo,
          remarks: row.remarks,
        },
        actorId
      );
      item.quantity = qty(item.quantity) + row.quantity;
      item.amount = qty(item.amount) + row.amount;
      inserted += 1;
    } catch (err) {
      failed.push({
        row: row.rowNumber,
        message: err.message || 'Failed to import row',
      });
    }
  }

  return {
    inserted,
    failed,
    skipped: failed.length,
    total: rows.length,
  };
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  bulkImportReceives,
};
