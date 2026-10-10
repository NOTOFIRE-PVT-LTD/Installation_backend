const { body, param, query } = require('express-validator');
const { PI_TEMPLATES } = require('../models/ProformaInvoice.model');

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const piList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 500 }),
  query('search').optional().trim(),
];

const nextNumber = [
  query('company').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid company'),
  query('party').optional().trim(),
  query('date').optional({ checkFalsy: true }).isISO8601(),
];

const piBody = [
  body('company.ref').isMongoId().withMessage('Seller company is required'),
  body('party.name').trim().notEmpty().withMessage('Party name is required'),
  body('party.ref').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('quotation.ref').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('piNumber').optional().trim().isLength({ max: 80 }).withMessage('PI number is too long'),
  body('piDate').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date'),
  body('template').optional().isIn(PI_TEMPLATES).withMessage('Invalid template'),
  body('items').isArray({ min: 1 }).withMessage('Add at least one item'),
  body('items.*.qty').optional().isFloat({ min: 0 }).withMessage('Qty must be 0 or more'),
  body('items.*.rate').optional().isFloat({ min: 0 }).withMessage('Unit rate must be 0 or more'),
  body('freight').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Freight must be 0 or more'),
  body('gstRate').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('GST % must be 0-100'),
];

const piCreate = [...piBody];
const piUpdate = [...idParam, ...piBody];

module.exports = { idParam, piList, nextNumber, piCreate, piUpdate };
