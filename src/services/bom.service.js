const mongoose = require('mongoose');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
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

async function removeProduction(id) {
  const production = await bomProductionRepository.findById(id);
  if (!production) throw new ApiError(404, 'BOM production not found');

  const movementIds = (production.movements || []).map((m) => String(m._id || m)).filter(Boolean);
  for (const movementId of movementIds) {
    try {
      await stockService.removeMovement(movementId);
    } catch (err) {
      // Movement already gone — still allow deleting the production record.
      if (err.statusCode !== 404) throw err;
    }
  }

  await bomProductionRepository.deleteById(id);
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
  }
  return String(value).trim();
}

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

/**
 * Parse BOM components Excel and resolve each row to an existing stock item.
 * Does not create a BOM — returns matched lines for the create/edit form.
 */
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
  listBoms,
  getBomById,
  createBom,
  updateBom,
  removeBom,
  previewProduction,
  confirmProduction,
  listProductions,
  getProductionById,
  removeProduction,
  buildComponentsImportTemplate,
  importComponentsPreview,
};
