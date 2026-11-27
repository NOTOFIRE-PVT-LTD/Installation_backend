const express = require('express');
const callLetterController = require('../controllers/callLetter.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { uploadCallLetterPdf } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const callLetterValidator = require('../validators/callLetter.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('financialDocuments'));

router.post('/parse-pdf', uploadCallLetterPdf, callLetterController.parsePdf);
router.post('/export-excel', callLetterController.exportExcelDirect);
router.get('/', validate(callLetterValidator.list), callLetterController.list);
router.get('/:id/export-excel', validate(callLetterValidator.idParam), callLetterController.exportExcelById);
router.get('/:id', validate(callLetterValidator.idParam), callLetterController.getById);
router.post('/', validate(callLetterValidator.create), callLetterController.create);
router.put('/:id', validate(callLetterValidator.update), callLetterController.update);
router.delete('/:id', validate(callLetterValidator.idParam), callLetterController.remove);

module.exports = router;
