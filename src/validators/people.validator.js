const { body, param, query } = require('express-validator');
const { USER_STATUS, ROLES, ADMIN_TYPES } = require('../config/constants');

const create = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
  body('gender').optional().isIn(['MALE', 'FEMALE']),
  body('role').optional().isIn(Object.values(ROLES)),
  body('adminType').optional().isIn(Object.values(ADMIN_TYPES)),
];

const update = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobileNumber').optional().trim().notEmpty().withMessage('Mobile number cannot be empty'),
  body('gender').optional().isIn(['MALE', 'FEMALE']),
  body('role').optional().isIn(Object.values(ROLES)),
  body('adminType').optional().isIn(Object.values(ADMIN_TYPES)),
];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(Object.values(ROLES)),
  query('search').optional().isString(),
  query('scope').optional().isString(),
];

const updateStatus = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('status').isIn(Object.values(USER_STATUS)).withMessage('Invalid status'),
];

module.exports = { create, update, list, updateStatus };
