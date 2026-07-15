const { body, param, query } = require('express-validator');
const { PAYMENT_STATUS, PAYMENT_METHOD } = require('../config/constants');

const create = [
  body('project').isMongoId().withMessage('Valid project is required'),
  body('method').isIn(Object.values(PAYMENT_METHOD)).withMessage('Valid payment method is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('remarks').optional().trim(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid payment id'),
  body('amount').optional().isFloat({ min: 0 }),
  body('method').optional().isIn(Object.values(PAYMENT_METHOD)),
  body('remarks').optional().trim(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid payment id')];

const updateStatus = [
  param('id').isMongoId().withMessage('Invalid payment id'),
  body('status').isIn(Object.values(PAYMENT_STATUS)).withMessage('Invalid status'),
];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

module.exports = { create, update, idParam, updateStatus, list };
