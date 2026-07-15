const express = require('express');
const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const validate = require('../middlewares/validate.middleware');
const authValidator = require('../validators/auth.validator');
const userValidator = require('../validators/user.validator');
const { uploadProfileImage } = require('../middlewares/upload.middleware');

const router = express.Router();

router.post('/login', validate(authValidator.login), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/forgot-password', validate(authValidator.forgotPassword), authController.forgotPassword);
router.post('/reset-password/:token', validate(authValidator.resetPassword), authController.resetPassword);
router.patch('/change-password', authenticate, validate(authValidator.changePassword), authController.changePassword);
router.patch(
  '/profile',
  authenticate,
  uploadProfileImage,
  validate(userValidator.updateProfile),
  authController.updateProfile
);

module.exports = router;
