const { body, param, query } = require('express-validator');

const create = [
  body('tender').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid tender id'),
  body('zone').optional().isString(),
  body('callLetter').optional().isString(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid call letter id'),
  body('tender').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid tender id'),
  body('zone').optional().isString(),
  body('callLetter').optional().isString(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid call letter id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('tender').optional().isMongoId(),
];

module.exports = { create, update, idParam, list };
