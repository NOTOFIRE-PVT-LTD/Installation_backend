const { body, param, query } = require('express-validator');
const { STOCK_MOVEMENT_TYPES, STOCK_CATALOG_KINDS, STOCK_ITEM_TYPES } = require('../config/constants');

const catalogList = [
  query('kind').isIn(Object.values(STOCK_CATALOG_KINDS)).withMessage('Invalid catalog kind'),
  query('parent').optional({ checkFalsy: true }).isMongoId(),
];

const catalogCreate = [
  body('kind').isIn(Object.values(STOCK_CATALOG_KINDS)).withMessage('Invalid catalog kind'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('parent').optional({ checkFalsy: true }).isMongoId(),
];

const itemCreate = [
  body('category').optional().trim(),
  body('component').optional().trim(),
  body('subComponent').optional().trim(),
  body('newCategory').optional().trim(),
  body('newComponent').optional().trim(),
  body('newSubComponent').optional().trim(),
  body('sku').optional().trim(),
  body('unit').optional().trim(),
  body('quantity').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('totalPiecesSale').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('itemType').optional().isIn(STOCK_ITEM_TYPES),
  body('salesOrder').optional().trim(),
  body('description').optional().trim(),
];

const itemUpdate = [
  param('id').isMongoId().withMessage('Invalid stock item id'),
  body('category').optional().trim(),
  body('component').optional().trim(),
  body('subComponent').optional().trim(),
  body('newCategory').optional().trim(),
  body('newComponent').optional().trim(),
  body('newSubComponent').optional().trim(),
  body('sku').optional().trim(),
  body('unit').optional().trim(),
  body('quantity').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('totalPiecesSale').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('itemType').optional().isIn(STOCK_ITEM_TYPES),
  body('salesOrder').optional().trim(),
  body('description').optional().trim(),
];

const itemIdParam = [param('id').isMongoId().withMessage('Invalid stock item id')];

const itemList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
];

const movementCreate = [
  body('type').isIn(Object.values(STOCK_MOVEMENT_TYPES)).withMessage('Invalid movement type'),
  body('stockItem').isMongoId().withMessage('Valid stock item is required'),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('movementDate').optional({ checkFalsy: true }).isISO8601(),
  body('supplierName').optional().trim(),
  body('issuedTo').optional().trim(),
  body('referenceNo').optional().trim(),
  body('remarks').optional().trim(),
];

const movementUpdate = [
  param('id').isMongoId().withMessage('Invalid movement id'),
  body('stockItem').optional().isMongoId().withMessage('Valid stock item is required'),
  body('quantity').optional().isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('movementDate').optional({ checkFalsy: true }).isISO8601(),
  body('supplierName').optional().trim(),
  body('issuedTo').optional().trim(),
  body('referenceNo').optional().trim(),
  body('remarks').optional().trim(),
];

const movementIdParam = [param('id').isMongoId().withMessage('Invalid movement id')];

const movementList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('type').optional().isIn(Object.values(STOCK_MOVEMENT_TYPES)),
  query('stockItem').optional().isMongoId(),
  query('issuedTo').optional().trim(),
];

module.exports = {
  catalogList,
  catalogCreate,
  itemCreate,
  itemUpdate,
  itemIdParam,
  itemList,
  movementCreate,
  movementUpdate,
  movementIdParam,
  movementList,
};
