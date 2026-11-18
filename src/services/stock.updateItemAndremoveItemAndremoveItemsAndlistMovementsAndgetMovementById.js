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

const { buildItemName, escapeRegex, parseRemoveDocIds, resolveItemCatalog, uploadDocs } = require('./stock.listCatalogAndcreateCatalog');
const { getItemById, itemTermCondition, searchTerms } = require('./stock.listItemsAnditemOptionsAndgetItemByIdAndcreateItemAndgetBalances');

async function updateItem(id, data, files, actorId) {
  const existing = await stockItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Stock item not found');

  const { category, component, subComponent } = await resolveItemCatalog(data, actorId);
  const itemType = STOCK_ITEM_TYPES.includes(data.itemType) ? data.itemType : existing.itemType;
  const newDocs = await uploadDocs(files?.docs || []);
  const removeIds = new Set(parseRemoveDocIds(data.removeDocIds));
  const keptDocs = (existing.docs || []).filter((doc) => !removeIds.has(doc.publicId));
  await Promise.all(
    (existing.docs || [])
      .filter((doc) => removeIds.has(doc.publicId))
      .map((doc) => uploadService.deleteAsset(doc.publicId, doc.resourceType || 'raw'))
  );

  await stockItemRepository.updateById(id, {
    category: category?._id || null,
    component: component._id,
    subComponent: subComponent?._id || null,
    categoryName: category?.name || '',
    componentName: component.name,
    subComponentName: subComponent?.name || '',
    name: buildItemName({ category, component, subComponent }),
    sku: data.sku !== undefined ? String(data.sku || '').trim() : existing.sku,
    unit: String(data.unit || existing.unit || 'Nos').trim() || 'Nos',
    quantity: data.quantity !== undefined ? Math.max(0, Number(data.quantity) || 0) : existing.quantity,
    amount: data.amount !== undefined ? Math.max(0, Number(data.amount) || 0) : existing.amount,
    totalPiecesSale:
      data.totalPiecesSale !== undefined
        ? Math.max(0, Number(data.totalPiecesSale) || 0)
        : existing.totalPiecesSale,
    itemType,
    salesOrder: data.salesOrder !== undefined ? String(data.salesOrder || '').trim() : existing.salesOrder,
    description: data.description !== undefined ? String(data.description || '').trim() : existing.description,
    docs: [...keptDocs, ...newDocs],
    updatedBy: actorId,
  });
  return getItemById(id);
}

async function removeItem(id) {
  const existing = await stockItemRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Stock item not found');
  const movementCount = await stockMovementRepository.countDocuments({ stockItem: id });
  if (movementCount > 0) {
    throw new ApiError(400, 'Cannot delete item that already has stock movements');
  }
  const bomsUsingItem = await Bom.find({ $or: [{ 'components.stockItem': id }, { finishedItem: id }] })
    .select('name')
    .lean();
  if (bomsUsingItem.length > 0) {
    throw new ApiError(
      400,
      `Cannot delete item used in BOM: ${bomsUsingItem.map((bom) => bom.name).join(', ')}. Remove it from the BOM first.`
    );
  }
  await Promise.all(
    (existing.docs || []).map((doc) => uploadService.deleteAsset(doc.publicId, doc.resourceType || 'raw'))
  );
  await stockItemRepository.deleteById(id);
}

async function removeItems(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  if (!uniqueIds.length) throw new ApiError(400, 'Select at least one stock item');

  const deleted = [];
  const failed = [];
  for (const id of uniqueIds) {
    try {
      await removeItem(id);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, message: err.message || 'Failed to delete' });
    }
  }
  return { deleted, failed, requested: uniqueIds.length };
}

async function listMovements(query) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: STOCK_MAX_PAGE_SIZE });
  const sort = buildSort(query, MOVEMENT_SORT);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.stockItem) filter.stockItem = query.stockItem;
  if (query.issuedTo) filter.issuedTo = new RegExp(escapeRegex(String(query.issuedTo).trim()), 'i');
  const terms = searchTerms(query.search);
  if (terms.length) {
    filter.$and = await Promise.all(
      terms.map(async (term) => {
        const regex = new RegExp(escapeRegex(term), 'i');
        const matchingItems = await stockItemRepository.find(itemTermCondition(term), { select: '_id' });
        const conditions = [
          { supplierName: regex },
          { issuedTo: regex },
          { referenceNo: regex },
          { remarks: regex },
          { unit: regex },
          { stockItem: { $in: matchingItems.map((item) => item._id) } },
        ];
        const numeric = Number(term);
        if (term !== '' && Number.isFinite(numeric)) {
          conditions.push({ quantity: numeric }, { amount: numeric });
        }
        return { $or: conditions };
      })
    );
  }

  const { items, total } = await stockMovementRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: MOVEMENT_POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getMovementById(id) {
  const movement = await stockMovementRepository.findById(id, { populate: MOVEMENT_POPULATE });
  if (!movement) throw new ApiError(404, 'Stock movement not found');
  return movement;
}

module.exports = {
  STOCK_MAX_PAGE_SIZE,
  ITEM_SORT,
  MOVEMENT_SORT,
  ITEM_POPULATE,
  OTHER_VALUE,
  updateItem,
  removeItem,
  removeItems,
  listMovements,
  getMovementById,
};
