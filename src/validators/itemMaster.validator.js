const { body, param, query } = require('express-validator');
const { ITEM_MASTER_CATALOG_FIELDS } = require('../config/constants');

const catalogList = [
  query('kind').isIn(ITEM_MASTER_CATALOG_FIELDS).withMessage('Invalid catalog kind'),
];

const catalogCreate = [
  body('kind').isIn(ITEM_MASTER_CATALOG_FIELDS).withMessage('Invalid catalog kind'),
  body('name').trim().notEmpty().withMessage('Name is required'),
];

const catalogIdParam = [param('id').isMongoId().withMessage('Invalid catalog id')];

// Catalog dropdowns arrive either as a mongo id or the "__other__" sentinel, so they are
// validated in the service instead of here.
const itemFields = [
  body('endUse').optional().trim(),
  body('personAsked').optional().trim(),
  body('priceGuarantee').optional().trim(),
  body('itemName').trim().notEmpty().withMessage('Item name is required'),
  body('itemDescription').optional().trim(),
  body('quantity').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Quantity cannot be negative'),
  body('price').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Price cannot be negative'),
];

const itemCreate = [...itemFields];

const itemUpdate = [param('id').isMongoId().withMessage('Invalid item id'), ...itemFields];

const itemIdParam = [param('id').isMongoId().withMessage('Invalid item id')];

const itemList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  ...ITEM_MASTER_CATALOG_FIELDS.map((field) => query(field).optional({ checkFalsy: true }).isMongoId()),
];

module.exports = {
  catalogList,
  catalogCreate,
  catalogIdParam,
  itemCreate,
  itemUpdate,
  itemIdParam,
  itemList,
};
