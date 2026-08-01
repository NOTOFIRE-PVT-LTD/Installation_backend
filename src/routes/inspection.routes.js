const express = require('express');
const inspectionController = require('../controllers/inspection.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { uploadInspectionFiles } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const inspectionValidator = require('../validators/inspection.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('inspections'));

router.get('/', validate(inspectionValidator.list), inspectionController.list);
router.get('/:id', validate(inspectionValidator.idParam), inspectionController.getById);
router.post('/', uploadInspectionFiles, validate(inspectionValidator.create), inspectionController.create);
router.put('/:id', uploadInspectionFiles, validate(inspectionValidator.update), inspectionController.update);
router.delete('/:id', validate(inspectionValidator.idParam), inspectionController.remove);

module.exports = router;
