const { body, param, query } = require('express-validator');
const { LOA_TYPES } = require('../config/constants');

const create = [
  body('tenderName').trim().notEmpty().withMessage('Tender Name is required'),
  body('nitNumber').trim().notEmpty().withMessage('NIT Number is required'),
  body('nitDate').optional({ checkFalsy: true }).isISO8601(),
  body('items').optional().isArray(),
  body('items.*.itemName').optional().trim().notEmpty(),
  body('items.*.amount').optional().isFloat({ min: 0 }),
  body('items.*.quantity').optional().isFloat({ min: 0 }),
  body('loaNumber').optional().trim(),
  body('loaDate').optional({ checkFalsy: true }).isISO8601(),
  body('loaValue').optional().isFloat({ min: 0 }),
  body('loaWorkCompletion').optional({ checkFalsy: true }).isISO8601(),
  body('loaDivisionName').optional().trim(),
  body('contractorName').optional().trim(),
  body('loaItems').optional().isArray(),
  body('loaItems.*.itemName').optional().trim().notEmpty(),
  body('loaItems.*.amount').optional().isFloat({ min: 0 }),
  body('loaItems.*.loaType').optional().isIn(Object.values(LOA_TYPES)),
];

const update = [
  param('id').isMongoId().withMessage('Invalid tender id'),
  body('tenderName').optional().trim().notEmpty().withMessage('Tender Name is required'),
  body('nitNumber').optional().trim().notEmpty(),
  body('nitDate').optional({ checkFalsy: true }).isISO8601(),
  body('items').optional().isArray(),
  body('items.*.itemName').optional().trim().notEmpty(),
  body('items.*.amount').optional().isFloat({ min: 0 }),
  body('items.*.quantity').optional().isFloat({ min: 0 }),
  body('loaNumber').optional().trim(),
  body('loaDate').optional({ checkFalsy: true }).isISO8601(),
  body('loaValue').optional().isFloat({ min: 0 }),
  body('loaWorkCompletion').optional({ checkFalsy: true }).isISO8601(),
  body('loaDivisionName').optional().trim(),
  body('contractorName').optional().trim(),
  body('loaItems').optional().isArray(),
  body('loaItems.*.itemName').optional().trim().notEmpty(),
  body('loaItems.*.amount').optional().isFloat({ min: 0 }),
  body('loaItems.*.loaType').optional().isIn(Object.values(LOA_TYPES)),
];

const idParam = [param('id').isMongoId().withMessage('Invalid tender id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
];

module.exports = { create, update, idParam, list };
