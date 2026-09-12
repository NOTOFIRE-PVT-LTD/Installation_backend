const { body, param, query } = require('express-validator');
const { BILLING_PARTIES } = require('../models/BillingInvoice.model');

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('sortField').optional().trim(),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('party').optional().isIn(BILLING_PARTIES),
];

const idParam = [param('id').isMongoId().withMessage('Invalid billing id')];

const parseLoa = [
  body('text')
    .isString()
    .withMessage('LOA text is required')
    .trim()
    .notEmpty()
    .withMessage('LOA text is required')
    .isLength({ max: 200000 })
    .withMessage('LOA text is too large'),
  body('fileName').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('party').isIn(BILLING_PARTIES).withMessage('Party must be KE, AHT, or Arihant'),
];

const exportExcel = [
  query('ids').optional(),
  query('party').optional().isIn(BILLING_PARTIES),
];

module.exports = { list, idParam, parseLoa, exportExcel };
