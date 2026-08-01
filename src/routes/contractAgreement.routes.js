const express = require('express');
const contractAgreementController = require('../controllers/contractAgreement.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const contractAgreementValidator = require('../validators/contractAgreement.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('financialDocuments'));

router.get('/options', contractAgreementController.options);
router.get('/', validate(contractAgreementValidator.list), contractAgreementController.list);
router.get('/:id', validate(contractAgreementValidator.idParam), contractAgreementController.getById);
router.post('/', validate(contractAgreementValidator.create), contractAgreementController.create);
router.put('/:id', validate(contractAgreementValidator.update), contractAgreementController.update);
router.delete('/:id', validate(contractAgreementValidator.idParam), contractAgreementController.remove);

module.exports = router;
