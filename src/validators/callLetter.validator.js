const { body, param, query } = require('express-validator');

const create = [
  body('tender').isMongoId().withMessage('Valid tender is required'),
  body('zone').trim().notEmpty().withMessage('Zone is required'),
  body('callLetter').trim().notEmpty().withMessage('Call Letter is required'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid call letter id'),
  body('tender').optional().isMongoId().withMessage('Valid tender is required'),
  body('zone').optional().trim().notEmpty(),
  body('callLetter').optional().trim().notEmpty(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid call letter id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('tender').optional().isMongoId(),
];

module.exports = { create, update, idParam, list };
