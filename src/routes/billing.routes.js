const express = require('express');
const billingController = require('../controllers/billing.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const billingValidator = require('../validators/billing.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('billing'));

router.get('/', validate(billingValidator.list), billingController.list);
router.get('/export', validate(billingValidator.exportExcel), billingController.downloadExcel);
router.post('/parse', validate(billingValidator.parseLoa), billingController.parseLoa);
router.get('/:id', validate(billingValidator.idParam), billingController.getById);
router.delete('/:id', validate(billingValidator.idParam), billingController.remove);

module.exports = router;
