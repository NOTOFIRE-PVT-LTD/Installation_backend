const express = require('express');
const numberDirectoryController = require('../controllers/numberDirectory.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { uploadSpreadsheet } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const numberDirectoryValidator = require('../validators/numberDirectory.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('numbers'));

router.get('/', validate(numberDirectoryValidator.list), numberDirectoryController.list);
router.get('/:id', validate(numberDirectoryValidator.idParam), numberDirectoryController.getById);
router.post('/', validate(numberDirectoryValidator.create), numberDirectoryController.create);
router.put('/:id', validate(numberDirectoryValidator.update), numberDirectoryController.update);
router.delete('/:id', validate(numberDirectoryValidator.idParam), numberDirectoryController.remove);
router.post(
  '/import',
  uploadSpreadsheet,
  validate(numberDirectoryValidator.importFile),
  numberDirectoryController.importFile
);

module.exports = router;
