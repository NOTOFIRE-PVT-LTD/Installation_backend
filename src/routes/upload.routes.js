const express = require('express');
const uploadController = require('../controllers/upload.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const validate = require('../middlewares/validate.middleware');
const { body } = require('express-validator');

const router = express.Router();

router.use(authenticate);

router.post(
  '/cloudinary-sign',
  validate([
    body('resourceType')
      .optional()
      .isIn(['image', 'video'])
      .withMessage('resourceType must be image or video'),
  ]),
  uploadController.cloudinarySign
);

module.exports = router;
