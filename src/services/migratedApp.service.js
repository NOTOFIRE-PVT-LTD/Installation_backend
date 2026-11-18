const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

/** shortcut: in-memory TTL cache for migrated list/dashboard reads; upgrade to Redis if multi-instance. */
const cache = new Map();
const CACHE_TTL_MS = 60_000;

const SHIPPING_TABS = {
  home: null,
  shipments: 'shipping__shipments',
  products: 'shipping__products',
  cartons: 'shipping__cartons',
  locations: 'shipping__locations',
  couriers: 'shipping__couriers',
  invoices: 'shipping__courier_invoices',
  discrepancies: 'shipping__discrepancies',
  packing: 'shipping__packing_history',
  people: 'shipping__profiles',
  reconciliation: 'shipping__reconciliation_results',
  dispatches: 'shipping__dispatch_records',
  dispatch: 'shipping__dispatch_requirements',
  settings: 'shipping__settings',
  audit: 'shipping__audit_logs',
  reports: null,
};

const IMPORT_TABS = {
  home: null,
  imports: 'import__imports',
  suppliers: 'import__suppliers',
  shipments: 'import__shipments',
  documents: 'import__documents',
  tasks: 'import__tasks',
  payments: 'import__import_payments',
  cha: 'import__chas',
  inbox: 'import__communications',
  review: 'import__freight_quote_requests',
  reports: null,
  settings: 'import__app_settings',
};

function db() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new ApiError(503, 'Database not ready');
  }
  return mongoose.connection.db;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

function stripMeta(doc) {
  if (!doc) return null;
  const out = { ...doc };
  if (out._id) out.mongoId = String(out._id);
  delete out._id;
  delete out._migratedFrom;
  delete out._migratedAt;
  delete out._sourceTable;
  delete out._pg_id_field;
  return out;
}

async function countCollection(name) {
  try {
    return await db().collection(name).countDocuments({});
  } catch {
    return 0;
  }
}

async function getShippingDashboard() {
  const key = 'shipping:dashboard';
  const cached = cacheGet(key);
  if (cached) return cached;

  const [
    shipments,
    products,
    cartons,
    couriers,
    invoices,
    discrepancies,
    packing,
    locations,
  ] = await Promise.all([
    countCollection('shipping__shipments'),
    countCollection('shipping__products'),
    countCollection('shipping__cartons'),
    countCollection('shipping__couriers'),
    countCollection('shipping__courier_invoices'),
    countCollection('shipping__discrepancies'),
    countCollection('shipping__packing_history'),
    countCollection('shipping__locations'),
  ]);

  const recent = await db()
    .collection('shipping__shipments')
    .find({})
    .sort({ created_at: -1, dispatch_date: -1 })
    .limit(8)
    .toArray();

  return cacheSet(key, {
    metrics: {
      shipments,
      products,
      cartons,
      couriers,
      invoices,
      discrepancies,
      packing,
      locations,
    },
    recentShipments: recent.map(stripMeta),
    source: 'mongodb',
    cachedForSeconds: CACHE_TTL_MS / 1000,
  });
}

async function getImportDashboard() {
  const key = 'import:dashboard';
  const cached = cacheGet(key);
  if (cached) return cached;

  const [imports, suppliers, documents, tasks, shipments, chas, payments] = await Promise.all([
    countCollection('import__imports'),
    countCollection('import__suppliers'),
    countCollection('import__documents'),
    countCollection('import__tasks'),
    countCollection('import__shipments'),
    countCollection('import__chas'),
    countCollection('import__import_payments'),
  ]);

  const recent = await db()
    .collection('import__imports')
    .find({})
    .sort({ created_at: -1, po_date: -1 })
    .limit(8)
    .toArray();

  return cacheSet(key, {
    metrics: { imports, suppliers, documents, tasks, shipments, chas, payments },
    recentImports: recent.map(stripMeta),
    source: 'mongodb',
    cachedForSeconds: CACHE_TTL_MS / 1000,
  });
}

async function listTab(app, tab, query = {}) {
  const map = app === 'shipping' ? SHIPPING_TABS : IMPORT_TABS;
  if (!(tab in map)) throw new ApiError(400, `Unknown tab: ${tab}`);

  if (tab === 'home' || tab === 'reports') {
    return app === 'shipping' ? getShippingDashboard() : getImportDashboard();
  }

  const collection = map[tab];
  if (!collection) throw new ApiError(400, `No collection for tab: ${tab}`);

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const skip = (page - 1) * pageSize;
  const search = String(query.search || query.q || '').trim();

  const cacheKey = `${app}:${tab}:${page}:${pageSize}:${search}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const filter = {};
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (app === 'shipping') {
      filter.$or = [
        { shipment_number: rx },
        { customer_name: rx },
        { name: rx },
        { sku: rx },
        { full_name: rx },
        { email: rx },
        { destination_city: rx },
      ];
    } else {
      filter.$or = [
        { import_no: rx },
        { title: rx },
        { po_number: rx },
        { name: rx },
        { status: rx },
      ];
    }
  }

  const col = db().collection(collection);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter)
      .sort({ updated_at: -1, created_at: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
  ]);

  return cacheSet(cacheKey, {
    items: rows.map(stripMeta),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    collection,
    source: 'mongodb',
    cachedForSeconds: CACHE_TTL_MS / 1000,
  });
}

function invalidateAppCache(appPrefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${appPrefix}:`)) cache.delete(key);
  }
}

module.exports = {
  listTab,
  getShippingDashboard,
  getImportDashboard,
  invalidateAppCache,
  SHIPPING_TABS,
  IMPORT_TABS,
  CACHE_TTL_MS,
};
