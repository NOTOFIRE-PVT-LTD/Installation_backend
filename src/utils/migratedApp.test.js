const assert = require('node:assert/strict');
const { SHIPPING_TABS, IMPORT_TABS } = require('../services/migratedApp.service');

assert.equal(SHIPPING_TABS.shipments, 'shipping__shipments');
assert.equal(SHIPPING_TABS.products, 'shipping__products');
assert.equal(IMPORT_TABS.imports, 'import__imports');
assert.equal(IMPORT_TABS.suppliers, 'import__suppliers');
assert.equal(SHIPPING_TABS.home, null);
assert.equal(IMPORT_TABS.home, null);

console.log('migratedApp.test.js OK');
