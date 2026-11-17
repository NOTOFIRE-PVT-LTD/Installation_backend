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

const { buildItemName, resolveItemCatalog } = require('./stock.listCatalogAndcreateCatalog');

function findColumnIndex(headerRow, names) {
  let index = -1;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = String(cell.value || '')
      .trim()
      .toLowerCase();
    if (names.includes(value) && index === -1) index = colNumber;
  });
  return index;
}

function normalizeItemType(value) {
  const raw = String(value || '').trim();
  const match = STOCK_ITEM_TYPES.find((type) => type.toLowerCase() === raw.toLowerCase());
  return match || STOCK_ITEM_TYPES[0];
}

function itemCatalogKey({ componentName, subComponentName }) {
  return [componentName, subComponentName]
    .map((part) => String(part || '').trim().toLowerCase())
    .join('::');
}

async function buildStockItemsImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stock Items');
  sheet.columns = [
    { header: 'Component Name', key: 'componentName', width: 28 },
    { header: 'Sub Component Name', key: 'subComponentName', width: 28 },
    { header: 'Type', key: 'itemType', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    componentName: 'Cable',
    subComponentName: '6mm wire',
    itemType: 'Single Use',
  });
  sheet.addRow({
    componentName: 'Bracket',
    subComponentName: '',
    itemType: 'Reusable',
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function parseStockItemsWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  const isCsv = file.mimetype === 'text/csv' || file.originalname?.toLowerCase().endsWith('.csv');

  if (isCsv) {
    await workbook.csv.read(Readable.from(file.buffer));
  } else {
    await workbook.xlsx.load(file.buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, 'The uploaded file has no readable sheet');

  const headerRow = worksheet.getRow(1);
  const componentCol = findColumnIndex(headerRow, ['component name', 'component']);
  const subComponentCol = findColumnIndex(headerRow, [
    'sub component name',
    'sub component',
    'subcomponent',
    'sub component name (optional)',
  ]);
  const typeCol = findColumnIndex(headerRow, ['type', 'item type']);

  if (componentCol === -1) {
    throw new ApiError(
      400,
      'The file must have these columns: Component Name, Sub Component Name (optional), Type'
    );
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const componentName = String(row.getCell(componentCol).value || '').trim();
    const subComponentName =
      subComponentCol === -1 ? '' : String(row.getCell(subComponentCol).value || '').trim();
    const itemType = typeCol === -1 ? STOCK_ITEM_TYPES[0] : normalizeItemType(row.getCell(typeCol).value);
    if (componentName) {
      rows.push({ componentName, subComponentName, itemType });
    }
  });

  return rows;
}

async function bulkImportItems(file, actorId) {
  const rows = await parseStockItemsWorkbook(file);
  if (rows.length === 0) {
    throw new ApiError(400, 'No valid rows found in the uploaded file');
  }

  const existing = await stockItemRepository.find({}, { select: 'componentName subComponentName' });
  const existingKeys = new Set(
    existing.map((item) =>
      itemCatalogKey({
        componentName: item.componentName,
        subComponentName: item.subComponentName,
      })
    )
  );

  const seenInFile = new Set();
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = itemCatalogKey(row);
    if (existingKeys.has(key) || seenInFile.has(key)) {
      skipped += 1;
      continue;
    }
    seenInFile.add(key);

    const payload = {
      component: OTHER_VALUE,
      newComponent: row.componentName,
      subComponent: row.subComponentName ? OTHER_VALUE : '',
      newSubComponent: row.subComponentName || '',
      itemType: row.itemType,
    };

    const { category, component, subComponent } = await resolveItemCatalog(payload, actorId);
    await stockItemRepository.create({
      category: category?._id || null,
      component: component._id,
      subComponent: subComponent?._id || null,
      categoryName: category?.name || '',
      componentName: component.name,
      subComponentName: subComponent?.name || '',
      name: buildItemName({ category, component, subComponent }),
      sku: '',
      unit: 'Nos',
      quantity: 0,
      amount: 0,
      totalPiecesSale: 0,
      itemType: normalizeItemType(row.itemType),
      salesOrder: '',
      description: '',
      docs: [],
      createdBy: actorId,
      updatedBy: actorId,
    });
    existingKeys.add(key);
    inserted += 1;
  }

  return { inserted, skipped, total: rows.length };
}

function normalizeCellDate(value) {
  if (value == null || value === '') return new Date();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    // Excel serial date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stockItemMatchKey(componentName, subComponentName) {
  return [componentName, subComponentName]
    .map((part) => String(part || '').trim().toLowerCase())
    .join('::');
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  findColumnIndex,
  normalizeItemType,
  itemCatalogKey,
  buildStockItemsImportTemplate,
  parseStockItemsWorkbook,
  bulkImportItems,
  normalizeCellDate,
  stockItemMatchKey,
};
