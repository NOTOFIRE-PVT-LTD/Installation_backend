const { body, param } = require('express-validator');

const login = [
  // Do not normalizeEmail() — it rewrites Gmail addresses and can break login.
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPassword = [body('email').isEmail().withMessage('Valid email is required').normalizeEmail()];

const resetPassword = [
  param('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const changePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

module.exports = { login, forgotPassword, resetPassword, changePassword };
