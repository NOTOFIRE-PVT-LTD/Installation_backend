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

const { itemDisplayName } = require('./bom.listBomsAndgetBomByIdAndcreateBomAndupdateBomAndaddComponentsToProductions');
const { parseComponentsWorkbook, resolveStockItem } = require('./bom.buildComponentsImportTemplate');

async function importComponentsPreview(file) {
  const rows = await parseComponentsWorkbook(file);
  if (rows.length === 0) {
    throw new ApiError(400, 'No valid rows found in the uploaded file');
  }

  const stockItems = await stockItemRepository.find(
    {},
    { select: 'name sku unit categoryName componentName subComponentName' }
  );

  const components = [];
  const failed = [];
  const seen = new Set();

  for (const row of rows) {
    try {
      if (row.qtyEmpty || row.qtyPerPcs <= 0) {
        throw new Error('Qty Req. for 1 pcs. must be greater than 0');
      }
      if (!row.component && !row.partNo) {
        throw new Error('Components or Part No. is required');
      }

      const item = resolveStockItem(row, stockItems);
      const key = String(item._id);
      if (seen.has(key)) {
        throw new Error(`Duplicate component "${itemDisplayName(item)}" in file`);
      }
      seen.add(key);

      components.push({
        stockItem: item._id,
        qtyPerPcs: row.qtyPerPcs,
        unit: item.unit || 'Nos',
        label: itemDisplayName(item),
        partNo: item.sku || row.partNo || '',
        component: row.component || item.componentName || item.name,
      });
    } catch (err) {
      failed.push({ row: row.rowNumber, message: err.message || 'Invalid row' });
    }
  }

  return {
    total: rows.length,
    inserted: components.length,
    skipped: failed.length,
    components,
    failed,
  };
}

module.exports = {
  BOM_SORT,
  PRODUCTION_SORT,
  BOM_POPULATE,
  PRODUCTION_POPULATE,
  importComponentsPreview,
};
