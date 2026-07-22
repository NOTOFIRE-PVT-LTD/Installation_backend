const express = require('express');
const tenderController = require('../controllers/tender.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const { uploadTenderFiles } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const tenderValidator = require('../validators/tender.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermissionOrRole('cadDrawing', ROLES.USER), validate(tenderValidator.list), tenderController.list);
router.get('/:id', requirePermissionOrRole('cadDrawing', ROLES.USER), validate(tenderValidator.idParam), tenderController.getById);
router.post('/', requirePermissionOrRole('cadDrawing', ROLES.USER), uploadTenderFiles, validate(tenderValidator.create), tenderController.create);
router.put('/:id', requireRole(ROLES.ADMIN), requirePermission('cadDrawing'), uploadTenderFiles, validate(tenderValidator.update), tenderController.update);
router.delete('/:id', requireRole(ROLES.ADMIN), requirePermission('cadDrawing'), validate(tenderValidator.idParam), tenderController.remove);

module.exports = router;
