const express = require('express');
const bomController = require('../controllers/bom.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const bomValidator = require('../validators/bom.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('bom'));

router.get('/', validate(bomValidator.bomList), bomController.listBoms);
router.post('/', validate(bomValidator.bomCreate), bomController.createBom);
router.get('/productions', validate(bomValidator.productionList), bomController.listProductions);
router.get('/productions/:id', validate(bomValidator.productionIdParam), bomController.getProductionById);
router.post('/productions/preview', validate(bomValidator.productionPreview), bomController.previewProduction);
router.post('/productions/confirm', validate(bomValidator.productionConfirm), bomController.confirmProduction);
router.get('/:id', validate(bomValidator.bomIdParam), bomController.getBomById);
router.put('/:id', validate(bomValidator.bomUpdate), bomController.updateBom);
router.delete('/:id', validate(bomValidator.bomIdParam), bomController.removeBom);

module.exports = router;
