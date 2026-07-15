const { body, param, query } = require('express-validator');

const create = [
  body('division').isMongoId().withMessage('Valid division is required'),
  body('project').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid project'),
  body('tenderName').trim().notEmpty().withMessage('Tender name is required'),
  body('date').isISO8601().withMessage('Date is required'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid tender id'),
  body('division').optional().isMongoId().withMessage('Invalid division'),
  body('project').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid project'),
  body('tenderName').optional().trim().notEmpty(),
  body('date').optional().isISO8601(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid tender id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('division').optional().isMongoId(),
  query('zone').optional().trim(),
  query('project').optional().isMongoId(),
];

module.exports = { create, update, idParam, list };
