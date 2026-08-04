const express = require('express');
const bgApplicationController = require('../controllers/bgApplication.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const bgApplicationValidator = require('../validators/bgApplication.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('accounts'));

router.get('/', validate(bgApplicationValidator.list), bgApplicationController.list);
router.get('/:id', validate(bgApplicationValidator.idParam), bgApplicationController.getById);
router.post('/', validate(bgApplicationValidator.create), bgApplicationController.create);
router.put('/:id', validate(bgApplicationValidator.update), bgApplicationController.update);
router.delete('/:id', validate(bgApplicationValidator.idParam), bgApplicationController.remove);

module.exports = router;
