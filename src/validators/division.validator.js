const { body, param, query } = require('express-validator');

const create = [
  body('name').trim().notEmpty().withMessage('Division name is required'),
  body('zone').trim().notEmpty().withMessage('Zone is required'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid division id'),
  body('name').trim().notEmpty().withMessage('Division name is required'),
  body('zone').trim().notEmpty().withMessage('Zone is required'),
];

const idParam = [param('id').isMongoId().withMessage('Invalid division id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('zone').optional().trim(),
];

module.exports = { create, update, idParam, list };
