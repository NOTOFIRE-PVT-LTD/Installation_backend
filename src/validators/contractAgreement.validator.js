const { body, param, query } = require('express-validator');

const create = [
  body('tender').isMongoId().withMessage('Valid tender is required'),
  body('caDate').isISO8601().withMessage('CA Date is required'),
  body('caNumber').trim().notEmpty().withMessage('CA Number is required'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid contract agreement id'),
  body('tender').optional().isMongoId().withMessage('Valid tender is required'),
  body('caDate').optional().isISO8601(),
  body('caNumber').optional().trim().notEmpty(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid contract agreement id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('tender').optional().isMongoId(),
];

module.exports = { create, update, idParam, list };
