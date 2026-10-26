const { body, param, query } = require('express-validator');

const create = [
  body('companyName').trim().notEmpty().withMessage('Company name is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('assignedSalesperson').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid salesperson'),
  body('confirmDuplicates').optional().isBoolean(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('companyName').optional().trim().notEmpty().withMessage('Company name is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('assignedSalesperson').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid salesperson'),
  body('confirmDuplicates').optional().isBoolean(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('assignedSalesperson').optional().isMongoId(),
];

module.exports = { create, update, idParam, list };
