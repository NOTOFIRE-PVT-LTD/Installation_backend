const { query } = require('express-validator');

const search = [
  query('q')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query is too long'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query is too long'),
  query('limit').optional().isInt({ min: 1, max: 10 }),
];

module.exports = { search };
