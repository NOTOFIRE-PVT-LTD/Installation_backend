const ROLES = Object.freeze({
  ADMIN: 'Admin',
  USER: 'User',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const REPORT_STATUS = Object.freeze({
  PENDING: 'Pending',
  VERIFIED: 'Verified',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAID: 'Paid',
});

const PAYMENT_METHOD = Object.freeze({
  INSTALLER: 'Installer',
  CONTRACTOR: 'Contractor',
});

const CLAIM_STATUS = Object.freeze({
  NOT_SUBMITTED: 'Not Submitted',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
});

const SITE_TYPES = Object.freeze(['Station', 'IBH', 'Auto Hut', 'LC Gate', 'Telecom Exchange', 'Building']);

const DEFAULT_BONUS_PERCENT = 5;

const PERMISSION_KEYS = Object.freeze([
  'dashboard',
  'users',
  'projects',
  'reports',
  'payments',
  'numbers',
  'cadDrawing',
  'claimApprovals',
  'tenders',
  'tenderWhatsappAlerts',
  'inspections',
  'financialDocuments',
  'bgWhatsappAlerts',
  'accounts',
  'stockItems',
  'bom',
  'itemsMaster',
]);

const STOCK_MOVEMENT_TYPES = Object.freeze({
  SUPPLIER_IN: 'supplier_in',
  ISSUE_OUT: 'issue_out',
  UTILIZE: 'utilize',
  RETURN_IN: 'return_in',
});

const STOCK_CATALOG_KINDS = Object.freeze({
  CATEGORY: 'category',
  COMPONENT: 'component',
  SUB_COMPONENT: 'subComponent',
});

const STOCK_ITEM_TYPES = Object.freeze(['Single Use', 'Reusable']);

const DEFAULT_STOCK_COMPONENT_NAMES = Object.freeze([
  'Back cover Green',
  'Back cover Red',
  'Back cover Yellow',
  'BLK- NBLK Mode',
  'Boxes',
  'Bubble Pouch',
  'C-ON Circuit PCB',
  'C-ON LED PCB',
  'C-ON MOSFET PCB',
  'Capacitor',
  'Circuit PCB',
  'Delivery Charges',
  'Diode',
  'Diode SMD',
  'EPDM Rubber',
  'Fuse Glass',
  'Fuse Holder',
  'G LED PCB',
  'Green LED',
  'Heat Sink',
  'IC (Fairchild)',
  'IC (Texas)',
  'L type Mould',
  'Labour Charge, Material Delivery, Electricity, Rent',
  'Lens',
  'Line Filter',
  'Manual',
  'Mosfet',
  'MOSFET PCB',
  'Moulds Green',
  'Moulds Red',
  'Moulds Yellow',
  'Mounting',
  'MOV',
  'PCB Coating Spray',
  'R,Y LED PCB',
  'Red LED',
  'Resistance',
  'Route Circuit PCB',
  'Route EPDM Rubber',
  'Route Heat Sink',
  'Route LED PCB',
  'Route Lens',
  'Route MOSFET PCB',
  'Route Mould',
  'Route Name Plate',
  'Screw & Nuts',
  'Shunt Circuit PCB',
  'Shunt LED PCB',
  'Shunt MOSFET PCB',
  'Terminal Block',
  'Torroidal Transformer 160-160',
  'Transistor',
  'White LED',
  'Wire set',
  'Yellow LED',
  'Zener Diode',
]);

// Each key doubles as the MasterItem field name it fills, so the catalog and the
// form stay in sync without a separate mapping table.
const ITEM_MASTER_CATALOG_KINDS = Object.freeze({
  END_USE: 'endUse',
  PRICE_GUARANTEE: 'priceGuarantee',
  ITEM_CATEGORY: 'itemCategory',
  ITEM_NAME: 'itemName',
  QTY_TYPE: 'qtyType',
  PAYMENT: 'payment',
});

const ITEM_MASTER_CATALOG_FIELDS = Object.freeze(Object.values(ITEM_MASTER_CATALOG_KINDS));

const ITEM_MASTER_ITEM_CATALOG_FIELDS = Object.freeze(
  Object.values(ITEM_MASTER_CATALOG_KINDS).filter((kind) => kind !== ITEM_MASTER_CATALOG_KINDS.ITEM_NAME)
);

const INSPECTION_STATUS = Object.freeze({
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
});

const LOA_TYPES = Object.freeze({
  NOTOFIRE: 'Notofire',
  THIRD_PARTY: 'Third Party',
});

const NUMBER_CATEGORIES = Object.freeze({
  GOVERNMENT_OFFICIAL: 'Government Official',
  INSTALLER: 'Installer',
  MANAGEMENT: 'Management',
});

module.exports = {
  ROLES,
  USER_STATUS,
  REPORT_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  CLAIM_STATUS,
  SITE_TYPES,
  DEFAULT_BONUS_PERCENT,
  PERMISSION_KEYS,
  INSPECTION_STATUS,
  LOA_TYPES,
  NUMBER_CATEGORIES,
  STOCK_MOVEMENT_TYPES,
  STOCK_CATALOG_KINDS,
  STOCK_ITEM_TYPES,
  DEFAULT_STOCK_COMPONENT_NAMES,
  ITEM_MASTER_CATALOG_KINDS,
  ITEM_MASTER_CATALOG_FIELDS,
  ITEM_MASTER_ITEM_CATALOG_FIELDS,
};
