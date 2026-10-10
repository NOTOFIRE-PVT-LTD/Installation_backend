const express = require('express');
const proformaInvoiceController = require('../controllers/proformaInvoice.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const piValidator = require('../validators/proformaInvoice.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('proformaInvoices'));

router.get('/next-number', validate(piValidator.nextNumber), proformaInvoiceController.suggestNumber);
router.get('/options/companies', proformaInvoiceController.listCompanies);
router.get('/options/parties', proformaInvoiceController.listParties);
router.get('/options/quotations', proformaInvoiceController.listQuotations);
router.get('/options/quotations/:id', validate(piValidator.idParam), proformaInvoiceController.getQuotation);

router.get('/', validate(piValidator.piList), proformaInvoiceController.listProformaInvoices);
router.post('/', validate(piValidator.piCreate), proformaInvoiceController.createProformaInvoice);
router.get('/:id', validate(piValidator.idParam), proformaInvoiceController.getProformaInvoiceById);
router.put('/:id', validate(piValidator.piUpdate), proformaInvoiceController.updateProformaInvoice);
router.delete('/:id', validate(piValidator.idParam), proformaInvoiceController.removeProformaInvoice);

module.exports = router;
