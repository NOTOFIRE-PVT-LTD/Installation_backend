const { body, param, query } = require('express-validator');
const { VISIT_EXPENSE_STATUS, TRANSPORT_MODE } = require('../config/constants');

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(Object.values(VISIT_EXPENSE_STATUS)),
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];

const idParam = [param('id').isMongoId()];
const itemParam = [param('id').isMongoId(), param('itemId').isMongoId()];

const update = [
  param('id').isMongoId(),
  body('items').isArray(),
  body('items.*.transportMode').optional().isIn(Object.values(TRANSPORT_MODE)),
  body('items.*.fare').optional().isFloat({ min: 0 }),
  body('gstAmount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
];

const review = [
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'REJECTED', 'approved', 'rejected']),
  body('adminComment').optional().isString(),
  body('rejectionReason').optional().isString(),
];

module.exports = { list, idParam, itemParam, update, review };
