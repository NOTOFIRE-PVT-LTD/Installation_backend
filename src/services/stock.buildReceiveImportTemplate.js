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
const { findColumnIndex, normalizeCellDate, stockItemMatchKey } = require('./stock.buildStockItemsImportTemplateAndbulkImportItems');

function findStockItemForReceive(items, row) {
  const componentName = String(row.componentName || '').trim();
  const subComponentName = String(row.subComponentName || '').trim();
  const stockItemLabel = String(row.stockItemLabel || '').trim();

  if (componentName) {
    const key = stockItemMatchKey(componentName, subComponentName);
    const byParts = items.find(
      (item) => stockItemMatchKey(item.componentName, item.subComponentName) === key
    );
    if (byParts) return byParts;
  }

  if (stockItemLabel) {
    const needle = stockItemLabel.toLowerCase();
    return items.find((item) => {
      const path = [item.componentName, item.subComponentName].filter(Boolean).join(' / ').toLowerCase();
      return (
        String(item.name || '').toLowerCase() === needle ||
        path === needle ||
        String(item.sku || '').toLowerCase() === needle
      );
    });
  }

  return null;
}

async function buildReceiveImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Receive from Supplier');
  sheet.columns = [
    { header: 'Component Name', key: 'componentName', width: 24 },
    { header: 'Sub Component Name', key: 'subComponentName', width: 24 },
    { header: 'Supplier Name', key: 'supplierName', width: 22 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'UOM', key: 'unit', width: 10 },
    { header: 'Date', key: 'movementDate', width: 14 },
    { header: 'Reference / Challan No.', key: 'referenceNo', width: 22 },
    { header: 'Remarks', key: 'remarks', width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    componentName: 'Cable',
    subComponentName: '6mm wire',
    supplierName: 'ABC Traders',
    amount: 1500,
    quantity: 10,
    unit: 'Metres',
    movementDate: '2026-09-07',
    referenceNo: 'CH-001',
    remarks: 'Sample receive row',
  });
  sheet.addRow({
    componentName: 'Bracket',
    subComponentName: '',
    supplierName: 'XYZ Supplies',
    amount: 500,
    quantity: 5,
    unit: 'Nos',
    movementDate: '2026-09-07',
    referenceNo: '',
    remarks: '',
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function parseReceiveWorkbook(file) {
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
  const componentCol = findColumnIndex(headerRow, ['component name', 'component']);
  const subComponentCol = findColumnIndex(headerRow, [
    'sub component name',
    'sub component',
    'subcomponent',
  ]);
  const stockItemCol = findColumnIndex(headerRow, ['stock item', 'item', 'item name']);
  const supplierCol = findColumnIndex(headerRow, ['supplier name', 'supplier']);
  const amountCol = findColumnIndex(headerRow, ['amount']);
  const quantityCol = findColumnIndex(headerRow, ['quantity', 'qty']);
  const unitCol = findColumnIndex(headerRow, [
    'uom',
    'unit',
    'unit of measurement',
    'unit of measurement (uom)',
  ]);
  const dateCol = findColumnIndex(headerRow, ['date', 'movement date', 'receive date']);
  const referenceCol = findColumnIndex(headerRow, [
    'reference / challan no.',
    'reference / challan no',
    'reference',
    'challan no.',
    'challan no',
    'reference no',
    'reference no.',
  ]);
  const remarksCol = findColumnIndex(headerRow, ['remarks', 'remark', 'notes']);

  if ((componentCol === -1 && stockItemCol === -1) || supplierCol === -1 || amountCol === -1 || quantityCol === -1) {
    throw new ApiError(
      400,
      'The file must have Component Name (or Stock Item), Supplier Name, Amount, and Quantity columns'
    );
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const componentName =
      componentCol === -1 ? '' : String(row.getCell(componentCol).value || '').trim();
    const subComponentName =
      subComponentCol === -1 ? '' : String(row.getCell(subComponentCol).value || '').trim();
    const stockItemLabel =
      stockItemCol === -1 ? '' : String(row.getCell(stockItemCol).value || '').trim();
    const supplierName = String(row.getCell(supplierCol).value || '').trim();
    const amountRaw = row.getCell(amountCol).value;
    const quantityRaw = row.getCell(quantityCol).value;
    const amountEmpty = amountRaw == null || String(amountRaw).trim() === '';
    const quantityEmpty = quantityRaw == null || String(quantityRaw).trim() === '';
    const amount = qty(amountRaw);
    const quantity = qty(quantityRaw);
    const movementDate = normalizeCellDate(dateCol === -1 ? null : row.getCell(dateCol).value);
    const referenceNo =
      referenceCol === -1 ? '' : String(row.getCell(referenceCol).value || '').trim();
    const remarks = remarksCol === -1 ? '' : String(row.getCell(remarksCol).value || '').trim();
    const unit = unitCol === -1 ? '' : String(row.getCell(unitCol).value || '').trim();

    if (!componentName && !stockItemLabel && !supplierName && quantityEmpty && amountEmpty) return;
    rows.push({
      rowNumber,
      componentName,
      subComponentName,
      stockItemLabel,
      supplierName,
      amount,
      amountEmpty,
      quantity,
      unit,
      movementDate,
      referenceNo,
      remarks,
    });
  });

  return rows;
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  findStockItemForReceive,
  buildReceiveImportTemplate,
  parseReceiveWorkbook,
};
