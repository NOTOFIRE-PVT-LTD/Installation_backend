const { body, param, query } = require('express-validator');
const { ROLES, USER_STATUS, PERMISSION_KEYS } = require('../config/constants');

const create = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('mobileNumber').trim().notEmpty().withMessage('Mobile number is required'),
  body('role').isIn(Object.values(ROLES)).withMessage('Invalid role'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobileNumber').optional().trim().notEmpty().withMessage('Mobile number cannot be empty'),
  body('role').optional().isIn(Object.values(ROLES)).withMessage('Invalid role'),
];

const idParam = [param('id').isMongoId().withMessage('Invalid user id')];

const updateStatus = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('status').isIn(Object.values(USER_STATUS)).withMessage('Invalid status'),
];

const updatePermissions = [
  param('id').isMongoId().withMessage('Invalid user id'),
  ...PERMISSION_KEYS.map((key) => body(key).optional().isBoolean().withMessage(`${key} must be boolean`)),
];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

const updateProfile = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobileNumber').optional().trim().notEmpty().withMessage('Mobile number cannot be empty'),
];

module.exports = { create, update, idParam, updateStatus, updatePermissions, list, updateProfile };
