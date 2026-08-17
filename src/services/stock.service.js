const mongoose = require('mongoose');
const stockItemRepository = require('../repositories/stockItem.repository');
const stockMovementRepository = require('../repositories/stockMovement.repository');
const stockCatalogRepository = require('../repositories/stockCatalog.repository');
const StockMovement = require('../models/StockMovement.model');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const {
  STOCK_MOVEMENT_TYPES,
  STOCK_CATALOG_KINDS,
  STOCK_ITEM_TYPES,
  DEFAULT_STOCK_COMPONENT_NAMES,
} = require('../config/constants');

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isOther(value) {
  return !value || String(value) === OTHER_VALUE;
}

async function findOrCreateCatalog({ kind, name, parent, actorId }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new ApiError(400, 'Name is required');
  const filter = {
    kind,
    parent: parent || null,
    name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
  };
  const existing = await stockCatalogRepository.findOne(filter);
  if (existing) return existing;
  return stockCatalogRepository.create({
    kind,
    name: trimmed,
    parent: parent || null,
    createdBy: actorId,
  });
}

async function resolveCatalogEntry({ kind, id, otherName, parent, actorId, label }) {
  if (!isOther(id)) {
    const entry = await stockCatalogRepository.findById(id);
    if (!entry || entry.kind !== kind) throw new ApiError(400, `Invalid ${label}`);
    if (parent && String(entry.parent || '') !== String(parent)) {
      throw new ApiError(400, `${label} does not belong to the selected parent`);
    }
    return entry;
  }
  const created = await findOrCreateCatalog({ kind, name: otherName, parent, actorId });
  return created;
}

let seededComponentCount = -1;

function sortCatalog(items, preferredNames = []) {
  const index = new Map(preferredNames.map((name, i) => [String(name).toLowerCase(), i]));
  return [...items].sort((a, b) => {
    const ai = index.has(String(a.name).toLowerCase()) ? index.get(String(a.name).toLowerCase()) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(String(b.name).toLowerCase()) ? index.get(String(b.name).toLowerCase()) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a.name).localeCompare(String(b.name));
  });
}

async function ensureDefaultStockComponents() {
  if (seededComponentCount === DEFAULT_STOCK_COMPONENT_NAMES.length) return;
  for (const name of DEFAULT_STOCK_COMPONENT_NAMES) {
    await findOrCreateCatalog({
      kind: STOCK_CATALOG_KINDS.COMPONENT,
      name,
      parent: null,
    });
  }
  seededComponentCount = DEFAULT_STOCK_COMPONENT_NAMES.length;
}

async function listCatalog(query) {
  const kind = query.kind;
  if (!Object.values(STOCK_CATALOG_KINDS).includes(kind)) {
    throw new ApiError(400, 'Invalid catalog kind');
  }
  if (kind === STOCK_CATALOG_KINDS.COMPONENT) {
    await ensureDefaultStockComponents();
    const filter = { kind };
    if (query.parent) {
      filter.$or = [{ parent: null }, { parent: query.parent }];
    } else {
      filter.parent = null;
    }
    const items = await stockCatalogRepository.find(filter, { sort: { name: 1 } });
    return sortCatalog(items, DEFAULT_STOCK_COMPONENT_NAMES);
  }
  const filter = { kind };
  if (kind === STOCK_CATALOG_KINDS.CATEGORY) {
    filter.parent = null;
  } else if (query.parent) {
    filter.parent = query.parent;
  } else {
    return [];
  }
  return stockCatalogRepository.find(filter, { sort: { name: 1 } });
}

async function createCatalog(data, actorId) {
  const kind = data.kind;
  if (!Object.values(STOCK_CATALOG_KINDS).includes(kind)) {
    throw new ApiError(400, 'Invalid catalog kind');
  }
  let parent = null;
  if (kind === STOCK_CATALOG_KINDS.COMPONENT && data.parent) {
    const category = await stockCatalogRepository.findById(data.parent);
    if (!category || category.kind !== STOCK_CATALOG_KINDS.CATEGORY) {
      throw new ApiError(400, 'Valid category is required');
    }
    parent = category._id;
  }
  if (kind === STOCK_CATALOG_KINDS.SUB_COMPONENT) {
    if (!data.parent) throw new ApiError(400, 'Component is required');
    const component = await stockCatalogRepository.findById(data.parent);
    if (!component || component.kind !== STOCK_CATALOG_KINDS.COMPONENT) {
      throw new ApiError(400, 'Valid component is required');
    }
    parent = component._id;
  }
  return findOrCreateCatalog({ kind, name: data.name, parent, actorId });
}

async function resolveItemCatalog(data, actorId) {
  const category = await resolveCatalogEntry({
    kind: STOCK_CATALOG_KINDS.CATEGORY,
    id: data.category,
    otherName: data.newCategory || data.categoryName,
    actorId,
    label: 'component category',
  });
  const component = await resolveCatalogEntry({
    kind: STOCK_CATALOG_KINDS.COMPONENT,
    id: data.component,
    otherName: data.newComponent || data.componentName,
    actorId,
    label: 'component name',
  });
  // Sub component is optional — the item then belongs directly to the component.
  const subComponentName = data.newSubComponent || data.subComponentName;
  const hasSubComponent = isOther(data.subComponent)
    ? Boolean(String(subComponentName || '').trim())
    : true;
  const subComponent = hasSubComponent
    ? await resolveCatalogEntry({
        kind: STOCK_CATALOG_KINDS.SUB_COMPONENT,
        id: data.subComponent,
        otherName: subComponentName,
        parent: component._id,
        actorId,
        label: 'sub component name',
      })
    : null;
  return { category, component, subComponent };
}

function buildItemName({ category, component, subComponent }) {
  return subComponent?.name || component.name || category.name;
}

async function uploadDocs(files = []) {
  return Promise.all((files || []).map((file) => uploadService.uploadCadFile(file)));
}

function parseRemoveDocIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
}

const MOVEMENT_POPULATE = [
  { path: 'stockItem', select: 'name sku unit categoryName componentName subComponentName' },
  { path: 'createdBy', select: 'name email' },
];

const { SUPPLIER_IN, ISSUE_OUT, UTILIZE, RETURN_IN } = STOCK_MOVEMENT_TYPES;

function qty(n) {
  return Math.max(0, Number(n) || 0);
}

function personKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

// `excludeMovementId` lets an edit validate against balances as they would be
// without the movement being edited.
async function getBalances(stockItemId, { excludeMovementId } = {}) {
  const itemObjectId = new mongoose.Types.ObjectId(String(stockItemId));
  const match = { stockItem: itemObjectId };
  if (excludeMovementId) {
    match._id = { $ne: new mongoose.Types.ObjectId(String(excludeMovementId)) };
  }
  const rows = await StockMovement.aggregate([
    { $match: match },
    {
      $group: {
        _id: { type: '$type', issuedTo: '$issuedTo' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);

  let inbound = 0;
  let issued = 0;
  let utilized = 0;
  let returned = 0;
  const byPerson = new Map();

  rows.forEach((row) => {
    const type = row._id.type;
    const amount = qty(row.quantity);
    const key = personKey(row._id.issuedTo);

    if (type === SUPPLIER_IN) inbound += amount;
    if (type === ISSUE_OUT) {
      issued += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.issued += amount;
        byPerson.set(key, cur);
      }
    }
    if (type === UTILIZE) {
      utilized += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.utilized += amount;
        byPerson.set(key, cur);
      }
    }
    if (type === RETURN_IN) {
      returned += amount;
      if (key) {
        const cur = byPerson.get(key) || { name: String(row._id.issuedTo || '').trim(), issued: 0, utilized: 0, returned: 0 };
        cur.returned += amount;
        byPerson.set(key, cur);
      }
    }
  });

  // Without a separate Issue step: warehouse depletes on Utilize, and returns restore stock.
  const warehouseQty = inbound + returned - utilized;
  const personQtys = {};
  byPerson.forEach((val, key) => {
    personQtys[key] = {
      name: val.name,
      holding: Math.max(0, val.utilized - val.returned),
      issued: val.issued,
      utilized: val.utilized,
      returned: val.returned,
    };
  });

  return { inbound, issued, utilized, returned, warehouseQty, personQtys };
}

async function listItems(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ITEM_SORT);
  const filter = {};
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { name: regex },
      { sku: regex },
      { categoryName: regex },
      { componentName: regex },
      { subComponentName: regex },
      { salesOrder: regex },
      { description: regex },
    ];
  }

  const { items, total } = await stockItemRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: ITEM_POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function itemOptions() {
  return stockItemRepository.find(
    {},
    { select: 'name sku unit categoryName componentName subComponentName', sort: { name: 1 } }
  );
}

async function getItemById(id) {
  const item = await stockItemRepository.findById(id, { populate: ITEM_POPULATE });
  if (!item) throw new ApiError(404, 'Stock item not found');
  return item;
}

async function createItem(data, files, actorId) {
  const { category, component, subComponent } = await resolveItemCatalog(data, actorId);
  const itemType = STOCK_ITEM_TYPES.includes(data.itemType) ? data.itemType : STOCK_ITEM_TYPES[0];
  const docs = await uploadDocs(files?.docs || []);

  const created = await stockItemRepository.create({
    category: category._id,
    component: component._id,
    subComponent: subComponent?._id || null,
    categoryName: category.name,
    componentName: component.name,
    subComponentName: subComponent?.name || '',
    name: buildItemName({ category, component, subComponent }),
    sku: String(data.sku || '').trim(),
    unit: String(data.unit || 'Nos').trim() || 'Nos',
    quantity: Math.max(0, Number(data.quantity) || 0),
    amount: Math.max(0, Number(data.amount) || 0),
    totalPiecesSale: Math.max(0, Number(data.totalPiecesSale) || 0),
    itemType,
    salesOrder: String(data.salesOrder || '').trim(),
    description: String(data.description || '').trim(),
    docs,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getItemById(created._id);
}

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
    category: category._id,
    component: component._id,
    subComponent: subComponent?._id || null,
    categoryName: category.name,
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
  await Promise.all(
    (existing.docs || []).map((doc) => uploadService.deleteAsset(doc.publicId, doc.resourceType || 'raw'))
  );
  await stockItemRepository.deleteById(id);
}

async function listMovements(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, MOVEMENT_SORT);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.stockItem) filter.stockItem = query.stockItem;
  if (query.issuedTo) filter.issuedTo = new RegExp(String(query.issuedTo).trim(), 'i');
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ supplierName: regex }, { issuedTo: regex }, { referenceNo: regex }, { remarks: regex }];
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

// Supplier receipts are also rolled up on the item itself, so any change has to
// undo the original contribution first.
async function rollbackReceiptTotals(movement) {
  const item = await stockItemRepository.findById(movement.stockItem);
  if (!item) return;
  await stockItemRepository.updateById(item._id, {
    quantity: Math.max(0, qty(item.quantity) - qty(movement.quantity)),
    amount: Math.max(0, qty(item.amount) - qty(movement.amount)),
  });
}

async function removeMovement(id) {
  const movement = await stockMovementRepository.findById(id);
  if (!movement) throw new ApiError(404, 'Stock movement not found');

  const balances = await getBalances(movement.stockItem);
  const amount = qty(movement.quantity);

  if (movement.type === SUPPLIER_IN && amount > balances.warehouseQty) {
    throw new ApiError(400, 'Cannot delete this receipt — warehouse stock has already been utilized');
  }

  if (movement.type === RETURN_IN && amount > balances.warehouseQty) {
    throw new ApiError(400, 'Cannot delete this return — warehouse stock has already been re-utilized');
  }

  if (movement.type === UTILIZE) {
    // Manual utilize has no person assignment. BOM utilizes may still have issuedTo.
    if (movement.issuedTo) {
      const holding = balances.personQtys[personKey(movement.issuedTo)]?.holding || 0;
      if (amount > holding) {
        throw new ApiError(400, 'Cannot delete this utilize — that person has already returned part of it');
      }
    }
  }

  if (movement.type === ISSUE_OUT) {
    const holding = balances.personQtys[personKey(movement.issuedTo)]?.holding || 0;
    if (amount > holding) {
      throw new ApiError(400, 'Cannot delete this issue — that person has already utilized or returned part of it');
    }
  }

  if (movement.type === SUPPLIER_IN) {
    await rollbackReceiptTotals(movement);
  }

  await stockMovementRepository.deleteById(id);
}

async function warehouseSummary() {
  const items = await stockItemRepository.find({}, { sort: { name: 1 } });
  const movements = await StockMovement.aggregate([
    {
      $group: {
        _id: { stockItem: '$stockItem', type: '$type', issuedTo: '$issuedTo' },
        quantity: { $sum: '$quantity' },
      },
    },
  ]);

  const byItem = new Map();
  items.forEach((item) => {
    byItem.set(String(item._id), {
      stockItem: item,
      inbound: 0,
      issued: 0,
      utilized: 0,
      returned: 0,
      people: new Map(),
    });
  });

  movements.forEach((row) => {
    const itemId = String(row._id.stockItem);
    const entry = byItem.get(itemId);
    if (!entry) return;
    const amount = qty(row.quantity);
    const type = row._id.type;
    const name = String(row._id.issuedTo || '').trim();
    const key = personKey(name);

    if (type === SUPPLIER_IN) entry.inbound += amount;
    if (type === ISSUE_OUT) {
      entry.issued += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.issued += amount;
        entry.people.set(key, cur);
      }
    }
    if (type === UTILIZE) {
      entry.utilized += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.utilized += amount;
        entry.people.set(key, cur);
      }
    }
    if (type === RETURN_IN) {
      entry.returned += amount;
      if (key) {
        const cur = entry.people.get(key) || { name, issued: 0, utilized: 0, returned: 0 };
        cur.returned += amount;
        entry.people.set(key, cur);
      }
    }
  });

  return Array.from(byItem.values()).map((entry) => ({
    _id: entry.stockItem._id,
    name: entry.stockItem.name,
    sku: entry.stockItem.sku,
    unit: entry.stockItem.unit,
    categoryName: entry.stockItem.categoryName,
    componentName: entry.stockItem.componentName,
    subComponentName: entry.stockItem.subComponentName,
    inbound: entry.inbound,
    issued: entry.issued,
    utilized: entry.utilized,
    returned: entry.returned,
    warehouseQty: entry.inbound + entry.returned - entry.utilized,
    people: Array.from(entry.people.values())
      .map((p) => ({
        name: p.name,
        issued: p.issued,
        utilized: p.utilized,
        returned: p.returned,
        holding: Math.max(0, p.utilized - p.returned),
      }))
      .filter((p) => p.holding > 0 || p.utilized > 0 || p.returned > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/**
 * Create multiple UTILIZE movements atomically (used by BOM production).
 * Each line: { stockItem, quantity, issuedTo, movementDate?, referenceNo?, remarks? }
 */
async function createUtilizeBatch(lines, actorId, { session } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(400, 'At least one utilize line is required');
  }

  const docs = [];
  for (const line of lines) {
    const item = await stockItemRepository.findById(line.stockItem);
    if (!item) throw new ApiError(404, `Stock item not found: ${line.stockItem}`);

    const quantity = qty(line.quantity);
    if (quantity <= 0) throw new ApiError(400, `Invalid quantity for ${item.name}`);

    const issuedTo = String(line.issuedTo || '').trim();
    if (!issuedTo) throw new ApiError(400, 'Person name is required');

    const balances = await getBalances(item._id);
    if (quantity > balances.warehouseQty) {
      throw new ApiError(
        400,
        `Not enough warehouse stock for ${item.name}. Available: ${balances.warehouseQty} ${item.unit || 'Nos'}, required: ${quantity}`
      );
    }

    docs.push({
      type: UTILIZE,
      stockItem: item._id,
      quantity,
      amount: 0,
      movementDate: line.movementDate || new Date(),
      supplierName: '',
      issuedTo,
      referenceNo: String(line.referenceNo || '').trim(),
      remarks: String(line.remarks || '').trim(),
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  const created = session
    ? await StockMovement.create(docs, { session, ordered: true })
    : await StockMovement.insertMany(docs, { ordered: true });

  return created;
}

module.exports = {
  listCatalog,
  createCatalog,
  listItems,
  itemOptions,
  getItemById,
  createItem,
  updateItem,
  removeItem,
  listMovements,
  getMovementById,
  createMovement,
  updateMovement,
  createUtilizeBatch,
  removeMovement,
  warehouseSummary,
  getBalances,
};
