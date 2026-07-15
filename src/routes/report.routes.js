const express = require('express');
const reportController = require('../controllers/report.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const { uploadReportFiles } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const reportValidator = require('../validators/report.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

const readOrOwn = requirePermissionOrRole('reports', ROLES.USER);

router.get('/', readOrOwn, validate(reportValidator.list), reportController.list);
router.get('/:id', readOrOwn, validate(reportValidator.idParam), reportController.getById);

router.post('/', readOrOwn, uploadReportFiles, validate(reportValidator.create), reportController.create);
router.put('/:id', readOrOwn, uploadReportFiles, validate(reportValidator.update), reportController.update);

router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  requirePermission('reports'),
  validate(reportValidator.idParam),
  reportController.remove
);
router.patch(
  '/:id/verify',
  requireRole(ROLES.ADMIN),
  requirePermission('reports'),
  validate(reportValidator.idParam),
  reportController.verify
);

module.exports = router;
