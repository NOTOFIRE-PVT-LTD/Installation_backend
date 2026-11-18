const { body, param, query } = require('express-validator');
const { LEAVE_PAY, LEAVE_STATUS } = require('../config/constants');

const create = [
  body('fromDate').trim().notEmpty().withMessage('From date is required'),
  body('toDate').trim().notEmpty().withMessage('To date is required'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
  body('payType').isIn(Object.values(LEAVE_PAY)),
  body('startTime').optional({ checkFalsy: true }).isString(),
  body('endTime').optional({ checkFalsy: true }).isString(),
];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(Object.values(LEAVE_STATUS)),
];

const review = [
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'REJECTED', 'approved', 'rejected']),
  body('adminComment').optional().isString(),
  body('rejectionReason').optional().isString(),
];

module.exports = { create, list, review };
