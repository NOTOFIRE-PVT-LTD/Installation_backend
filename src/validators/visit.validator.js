const { body, param, query } = require('express-validator');
const { VISIT_STATUS, VISIT_TYPE, VISIT_APPROVAL_DECISION, MISSED_VISIT_REASONS } = require('../config/constants');

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('salesperson').optional().isMongoId(),
  query('status').optional().isIn(Object.values(VISIT_STATUS)),
  query('date').optional().isISO8601({ strict: true }).isLength({ min: 10, max: 10 }),
];

const create = [
  body('salesperson').optional({ checkFalsy: true }).isMongoId(),
  body('customer').isMongoId().withMessage('Customer is required'),
  body('visitType').optional().isIn(Object.values(VISIT_TYPE)),
  body('visitDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
  body('visitDateTo').optional({ checkFalsy: true }).matches(/^\d{4}-\d{2}-\d{2}$/),
  body('plannedTime').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}$/),
  body('endTime').optional({ checkFalsy: true }).matches(/^\d{2}:\d{2}$/),
  body('purpose').trim().notEmpty().withMessage('Purpose is required'),
];

const selectDay = [body('visitIds').isArray({ min: 1 }).withMessage('Select at least one visit')];

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const proximity = [
  param('id').isMongoId(),
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude is required'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude is required'),
];

const check = [
  param('id').isMongoId(),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude is required'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude is required'),
  body('address').optional({ checkFalsy: true }).isString(),
  body('outcomeNotes').optional({ checkFalsy: true }).isString(),
];

const miss = [
  param('id').isMongoId(),
  body('reason').isIn(MISSED_VISIT_REASONS).withMessage('A missed-visit reason is required'),
  body('explanation').optional().isString(),
];

const approvals = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('decision').optional().isIn(Object.values(VISIT_APPROVAL_DECISION)),
];

const review = [
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'REJECTED', 'approved', 'rejected']),
  body('rejectionReason').optional().isString(),
];

module.exports = { list, create, selectDay, idParam, proximity, check, miss, approvals, review };
