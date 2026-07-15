const { body, param, query } = require('express-validator');

const create = [
  body('project').isMongoId().withMessage('Valid project is required'),
  body('date').isISO8601().withMessage('Date is required'),
  body('workDescription').trim().notEmpty().withMessage('Work description is required'),
  body('progressPercentage').isFloat({ min: 0, max: 100 }).withMessage('Progress % must be 0-100'),
  body('materialUsed').optional().trim(),
  body('remarks').optional().trim(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid report id'),
  body('date').optional().isISO8601(),
  body('workDescription').optional().trim().notEmpty(),
  body('progressPercentage').optional().isFloat({ min: 0, max: 100 }),
  body('materialUsed').optional().trim(),
  body('remarks').optional().trim(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid report id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { create, update, idParam, list };
