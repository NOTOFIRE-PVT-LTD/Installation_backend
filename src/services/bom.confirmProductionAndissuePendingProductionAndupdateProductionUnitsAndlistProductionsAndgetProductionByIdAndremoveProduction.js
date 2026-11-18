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

const { getBomById, qty } = require('./bom.listBomsAndgetBomByIdAndcreateBomAndupdateBomAndaddComponentsToProductions');
const { previewProduction, runInOptionalTransaction } = require('./bom.removeBomAndpreviewProduction');

async function confirmProduction(data, actorId) {
  const person = String(data.person || '').trim();
  if (!person) throw new ApiError(400, 'Person name is required');

  const preview = await previewProduction(data);

  const bom = await getBomById(data.bom);
  const productionDate = data.productionDate || new Date();
  const referenceNo = String(data.referenceNo || '').trim();
  const remarks = String(data.remarks || '').trim();
  const lineUnits = data.lineUnits && typeof data.lineUnits === 'object' ? data.lineUnits : {};
  preview.lines.forEach((line) => {
    const override = String(lineUnits[String(line.stockItem)] || '').trim();
    if (override) line.unit = override;
  });

  const production = await runInOptionalTransaction(async (session) => {
    const utilizeLines = preview.lines
      .filter((line) => line.issueNowQty > 0)
      .map((line) => ({
        stockItem: line.stockItem,
        quantity: line.issueNowQty,
        issuedTo: person,
        movementDate: productionDate,
        referenceNo,
        remarks: remarks || `BOM production: ${bom.name} v${bom.version} × ${preview.productionQty}`,
      }));

    const movements = utilizeLines.length
      ? await stockService.createUtilizeBatch(utilizeLines, actorId, { session })
      : [];

    const [created] = await BomProduction.create(
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
          status: preview.hasShortage ? 'pending' : 'completed',
          lines: preview.lines.map((line) => ({
            stockItem: line.stockItem,
            itemName: line.itemName,
            qtyPerPcs: line.qtyPerPcs,
            requiredQty: line.requiredQty,
            availableQty: line.availableQty,
            issuedQty: line.issueNowQty,
            pendingQty: line.pendingQty,
            unit: line.unit,
          })),
          movements: movements.map((m) => m._id),
          createdBy: actorId,
        },
      ],
      session ? { session } : undefined
    );
    return created;
  });

  return bomProductionRepository.findById(production._id, { populate: PRODUCTION_POPULATE });
}

async function updateProductionUnits(id, lines = []) {
  const production = await BomProduction.findById(id);
  if (!production) throw new ApiError(404, 'BOM production not found');

  lines.forEach(({ index, unit }) => {
    const line = production.lines[Number(index)];
    if (!line) throw new ApiError(400, `Production line ${index} not found`);
    const nextUnit = String(unit || '').trim();
    if (!nextUnit) throw new ApiError(400, 'Unit is required');
    line.unit = nextUnit;
  });
  production.markModified('lines');
  await production.save();

  return bomProductionRepository.findById(production._id, { populate: PRODUCTION_POPULATE });
}

async function issuePendingProduction(id, actorId) {
  const production = await BomProduction.findById(id);
  if (!production) throw new ApiError(404, 'BOM production not found');
  if (production.status !== 'pending') {
    throw new ApiError(400, 'This production has no pending quantity');
  }

  const movementDate = new Date();
  const plan = [];
  for (const line of production.lines) {
    const pending = qty(line.pendingQty);
    if (pending <= 0) continue;
    const balances = await stockService.getBalances(line.stockItem);
    const issueQty = Math.min(pending, qty(balances.warehouseQty));
    if (issueQty > 0) plan.push({ line, issueQty });
  }

  if (plan.length === 0) {
    throw new ApiError(400, 'No warehouse stock received yet for the pending items');
  }

  await runInOptionalTransaction(async (session) => {
    const movements = await stockService.createUtilizeBatch(
      plan.map(({ line, issueQty }) => ({
        stockItem: line.stockItem,
        quantity: issueQty,
        issuedTo: production.person,
        movementDate,
        referenceNo: production.referenceNo,
        remarks: `BOM production pending issue: ${production.bomName} v${production.bomVersion} × ${production.productionQty}`,
      })),
      actorId,
      { session }
    );

    plan.forEach(({ line, issueQty }) => {
      const alreadyIssued = line.issuedQty ?? qty(line.requiredQty) - qty(line.pendingQty);
      line.issuedQty = alreadyIssued + issueQty;
      line.pendingQty = Math.max(0, qty(line.pendingQty) - issueQty);
    });
    production.movements.push(...movements.map((m) => m._id));
    production.status = production.lines.some((line) => qty(line.pendingQty) > 0) ? 'pending' : 'completed';
    production.markModified('lines');
    await production.save(session ? { session } : undefined);
  });

  return bomProductionRepository.findById(production._id, { populate: PRODUCTION_POPULATE });
}

async function listProductions(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, PRODUCTION_SORT);
  const filter = {};
  if (query.bom) filter.bom = query.bom;
  if (query.person) filter.person = new RegExp(String(query.person).trim(), 'i');
  if (query.status === 'pending') filter.status = 'pending';
  if (query.status === 'completed') filter.status = { $ne: 'pending' };
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

module.exports = {
  BOM_SORT,
  PRODUCTION_SORT,
  BOM_POPULATE,
  PRODUCTION_POPULATE,
  confirmProduction,
  updateProductionUnits,
  issuePendingProduction,
  listProductions,
  getProductionById,
  removeProduction,
  cellText,
};
