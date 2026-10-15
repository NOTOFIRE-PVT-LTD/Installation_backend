const { param, query } = require('express-validator');

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const dcList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 500 }),
  query('search').optional().trim(),
];

const nextNumber = [
  query('company').isMongoId().withMessage('Select a seller company'),
  query('date').optional({ checkFalsy: true }).isISO8601(),
];

module.exports = { idParam, dcList, nextNumber };
