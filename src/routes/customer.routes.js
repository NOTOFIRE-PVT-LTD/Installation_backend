const express = require('express');
const customerController = require('../controllers/customer.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const customerValidator = require('../validators/customer.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requirePermissionOrRole('customers', ROLES.USER));

router.get('/', validate(customerValidator.list), customerController.list);
router.get('/:id', validate(customerValidator.idParam), customerController.getById);
router.post('/', requireRole(ROLES.ADMIN), requirePermission('salespersonTracking'), validate(customerValidator.create), customerController.create);
router.put('/:id', requireRole(ROLES.ADMIN), requirePermission('salespersonTracking'), validate(customerValidator.update), customerController.update);
router.delete('/:id', requireRole(ROLES.ADMIN), requirePermission('salespersonTracking'), validate(customerValidator.idParam), customerController.remove);

module.exports = router;
