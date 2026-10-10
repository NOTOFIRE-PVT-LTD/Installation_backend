const { body, param, query } = require('express-validator');
const { QUOTATION_STATUSES } = require('../models/Quotation.model');
const { QUOTATION_MASTER_KINDS } = require('../models/QuotationMaster.model');

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const masterKindParam = [param('kind').isIn(QUOTATION_MASTER_KINDS).withMessage('Invalid master type')];

const masterBody = [
  body('name').optional().trim(),
  body('gstin').optional().trim(),
  body('contactPerson').optional().trim(),
  body('phone').optional().trim(),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('content').optional().trim(),
  body('code').optional().trim().isLength({ max: 20 }).withMessage('Code must be at most 20 characters'),
  body('bank').optional().isObject(),
];

const masterCreate = [...masterKindParam, body('name').trim().notEmpty().withMessage('Name is required'), ...masterBody];
const masterUpdate = [...idParam, ...masterBody];

const quotationList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 1000 }),
  query('search').optional().trim(),
  query('status').optional({ checkFalsy: true }).isIn(QUOTATION_STATUSES),
  query('trash').optional().isIn(['true', 'false']),
];

const quotationBody = [
  body('salesperson').trim().notEmpty().withMessage('Salesperson is required'),
  body('projectName').trim().notEmpty().withMessage('Project name is required'),
  body('items').isArray({ min: 1 }).withMessage('Add at least one product'),
  body('items.*.qty').optional().isFloat({ min: 0 }).withMessage('Qty must be 0 or more'),
  body('items.*.price').optional().isFloat({ min: 0 }).withMessage('Price must be 0 or more'),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Discount must be 0-100'),
  body('gstRate').optional().isFloat({ min: 0 }),
  body('packingFreight').optional().isFloat({ min: 0 }),
  body('quotationDate').optional({ checkFalsy: true }).isISO8601(),
];

const quotationCreate = [...quotationBody];
const quotationUpdate = [...idParam, ...quotationBody];
const quotationStatus = [...idParam, body('status').isIn(QUOTATION_STATUSES).withMessage('Invalid status')];

module.exports = {
  idParam,
  masterKindParam,
  masterCreate,
  masterUpdate,
  quotationList,
  quotationCreate,
  quotationUpdate,
  quotationStatus,
};
