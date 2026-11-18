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

const { getBomById, itemDisplayName, personKey, qty } = require('./bom.listBomsAndgetBomByIdAndcreateBomAndupdateBomAndaddComponentsToProductions');

async function removeComponentsFromProductions(bomId, removedItemIds) {
  if (!removedItemIds.length) return { productions: [], movementIds: [] };
  const removed = new Set(removedItemIds);
  const productions = await BomProduction.find({
    bom: bomId,
    'lines.stockItem': { $in: removedItemIds },
  });
  if (!productions.length) return { productions: [], movementIds: [] };

  const linkedMovementIds = productions.flatMap((production) => (production.movements || []).map(String));
  const movements = linkedMovementIds.length
    ? await StockMovement.find({ _id: { $in: linkedMovementIds }, stockItem: { $in: removedItemIds } })
    : [];

  // Validate every reversal up front so we never delete half of them.
  const totals = new Map();
  movements.forEach((movement) => {
    const key = `${movement.stockItem}|${personKey(movement.issuedTo)}`;
    const entry = totals.get(key) || { stockItem: movement.stockItem, person: movement.issuedTo, quantity: 0 };
    entry.quantity += qty(movement.quantity);
    totals.set(key, entry);
  });
  for (const entry of totals.values()) {
    if (!entry.person) continue;
    const balances = await stockService.getBalances(entry.stockItem);
    const holding = balances.personQtys[personKey(entry.person)]?.holding || 0;
    if (entry.quantity > holding + 1e-9) {
      const item = await stockItemRepository.findById(entry.stockItem);
      throw new ApiError(
        400,
        `Cannot remove "${itemDisplayName(item)}" from this BOM: ${entry.person} has already returned part of the quantity issued for it in earlier productions.`
      );
    }
  }

  return { productions, movementIds: movements.map((movement) => String(movement._id)), removed };
}

async function applyComponentRemoval({ productions, movementIds, removed }) {
  for (const movementId of movementIds) {
    await stockService.removeMovement(movementId);
  }
  const deletedMovements = new Set(movementIds);

  for (const production of productions) {
    const lines = production.lines.filter((line) => !removed.has(String(line.stockItem)));
    const movements = (production.movements || []).filter((id) => !deletedMovements.has(String(id)));
    if (lines.length === 0) {
      await BomProduction.deleteOne({ _id: production._id });
      continue;
    }
    production.lines = lines;
    production.movements = movements;
    production.status = lines.some((line) => qty(line.pendingQty) > 0) ? 'pending' : 'completed';
    production.markModified('lines');
    await production.save();
  }
  return productions.length;
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
  const missingCount = bom.components.filter((component) => !component.stockItem).length;
  if (missingCount > 0) {
    throw new ApiError(
      400,
      `${missingCount} component(s) in "${bom.name}" point to a stock item that was deleted. Edit the BOM and re-select the item.`
    );
  }
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
      issueNowQty: requiredQty - shortage,
      pendingQty: shortage,
      unit: String(component.unit || '').trim() || item.unit || 'Nos',
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
    canConfirm: true,
    lines,
  };
}

async function runInOptionalTransaction(work) {
  const session = await mongoose.startSession();
  let useTransaction = true;
  try {
    session.startTransaction();
  } catch {
    useTransaction = false;
  }

  try {
    const result = await work(useTransaction ? session : undefined);
    if (useTransaction) await session.commitTransaction();
    return result;
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

module.exports = {
  BOM_SORT,
  PRODUCTION_SORT,
  BOM_POPULATE,
  PRODUCTION_POPULATE,
  removeComponentsFromProductions,
  applyComponentRemoval,
  removeBom,
  previewProduction,
  runInOptionalTransaction,
};
