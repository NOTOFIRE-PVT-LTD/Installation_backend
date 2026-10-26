const { body, query, param } = require('express-validator');
const { ATTENDANCE_CORRECTION_STATUS } = require('../config/constants');

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('salesperson').optional().isMongoId(),
  query('status').optional().isIn(['OPEN', 'CLOSED']),
  query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];

const punch = [
  body('kind').isIn(['IN', 'OUT', 'in', 'out']).withMessage('kind must be IN or OUT'),
  body('confirmUnfinished').optional(),
  body('address').optional({ nullable: true }).isString(),
];

const correction = [
  body('attendanceDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
  body('reason').trim().notEmpty().withMessage('A reason is required'),
  body('requestedPunchIn').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}$/),
  body('requestedPunchOut').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}$/),
];

const correctionsList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(Object.values(ATTENDANCE_CORRECTION_STATUS)),
  query('salesperson').optional().isMongoId(),
];

const review = [
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'REJECTED', 'approved', 'rejected']),
  body('adminComment').optional().isString(),
  body('rejectionReason').optional().isString(),
];

module.exports = { list, punch, correction, correctionsList, review };
