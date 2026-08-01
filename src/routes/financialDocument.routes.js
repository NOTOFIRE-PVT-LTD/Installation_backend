const express = require('express');
const financialDocumentController = require('../controllers/financialDocument.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const financialDocumentValidator = require('../validators/financialDocument.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('financialDocuments'));

router.get('/options', financialDocumentController.options);
router.get('/', validate(financialDocumentValidator.list), financialDocumentController.list);
router.get('/:id', validate(financialDocumentValidator.idParam), financialDocumentController.getById);
router.post('/', validate(financialDocumentValidator.create), financialDocumentController.create);
router.put('/:id', validate(financialDocumentValidator.update), financialDocumentController.update);
router.delete('/:id', validate(financialDocumentValidator.idParam), financialDocumentController.remove);

module.exports = router;
