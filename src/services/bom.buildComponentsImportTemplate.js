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

const { qty } = require('./bom.listBomsAndgetBomByIdAndcreateBomAndupdateBomAndaddComponentsToProductions');
const { cellText } = require('./bom.confirmProductionAndissuePendingProductionAndupdateProductionUnitsAndlistProductionsAndgetProductionByIdAndremoveProduction');

function findColumnIndex(headerRow, names) {
  let index = -1;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = cellText(cell.value).toLowerCase();
    if (names.includes(value) && index === -1) index = colNumber;
  });
  return index;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

async function buildComponentsImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BOM Components');
  sheet.columns = [
    { header: 'Components', key: 'component', width: 28 },
    { header: 'Part No.', key: 'partNo', width: 18 },
    { header: 'Qty Req. for 1 pcs.', key: 'qtyPerPcs', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    component: 'Fire Alarm Control Panel',
    partNo: 'FACP-001',
    qtyPerPcs: 1,
  });
  sheet.addRow({
    component: 'Smoke Detector',
    partNo: 'SD-100',
    qtyPerPcs: 4,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function parseComponentsWorkbook(file) {
  if (!file?.buffer) throw new ApiError(400, 'Upload an Excel file');

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
  const componentCol = findColumnIndex(headerRow, [
    'components',
    'component',
    'component name',
    'item',
    'item name',
  ]);
  const partNoCol = findColumnIndex(headerRow, [
    'part no.',
    'part no',
    'part number',
    'partnumber',
    'sku',
  ]);
  const qtyCol = findColumnIndex(headerRow, [
    'qty req. for 1 pcs.',
    'qty req. for 1 pcs',
    'qty required for 1 pcs',
    'qty for 1 pcs',
    'qty / 1 pcs',
    'qty per pcs',
    'qty',
    'quantity',
  ]);

  if (componentCol === -1 && partNoCol === -1) {
    throw new ApiError(400, 'The file must have Components and/or Part No. columns');
  }
  if (qtyCol === -1) {
    throw new ApiError(400, 'The file must have a Qty Req. for 1 pcs. column');
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const component = componentCol === -1 ? '' : cellText(row.getCell(componentCol).value);
    const partNo = partNoCol === -1 ? '' : cellText(row.getCell(partNoCol).value);
    const qtyRaw = row.getCell(qtyCol).value;
    const qtyEmpty = qtyRaw == null || cellText(qtyRaw) === '';
    if (!component && !partNo && qtyEmpty) return;
    rows.push({
      rowNumber,
      component,
      partNo,
      qtyPerPcs: qty(qtyRaw),
      qtyEmpty,
    });
  });

  return rows;
}

function resolveStockItem(row, stockItems) {
  const partKey = normalizeKey(row.partNo);
  const componentKey = normalizeKey(row.component);

  if (partKey) {
    const bySku = stockItems.filter((item) => normalizeKey(item.sku) === partKey);
    if (bySku.length === 1) return bySku[0];
    if (bySku.length > 1 && componentKey) {
      const narrowed = bySku.filter(
        (item) =>
          normalizeKey(item.componentName) === componentKey ||
          normalizeKey(item.name) === componentKey ||
          normalizeKey(item.subComponentName) === componentKey
      );
      if (narrowed.length === 1) return narrowed[0];
    }
    if (bySku.length > 1) {
      throw new Error(`Multiple stock items match Part No. "${row.partNo}"`);
    }
  }

  if (componentKey) {
    const exact = stockItems.filter(
      (item) =>
        normalizeKey(item.componentName) === componentKey ||
        normalizeKey(item.name) === componentKey ||
        normalizeKey(item.subComponentName) === componentKey
    );
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      throw new Error(
        `Multiple stock items match "${row.component}". Add Part No. to identify the item.`
      );
    }
  }

  const label = [row.component, row.partNo].filter(Boolean).join(' / ') || 'row';
  throw new Error(`No stock item found for ${label}`);
}

module.exports = {
  BOM_SORT,
  PRODUCTION_SORT,
  BOM_POPULATE,
  PRODUCTION_POPULATE,
  findColumnIndex,
  normalizeKey,
  buildComponentsImportTemplate,
  parseComponentsWorkbook,
  resolveStockItem,
};
