const express = require('express');
const divisionController = require('../controllers/division.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const divisionValidator = require('../validators/division.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermissionOrRole('cadDrawing', ROLES.USER), validate(divisionValidator.list), divisionController.list);
router.get('/:id', requirePermissionOrRole('cadDrawing', ROLES.USER), validate(divisionValidator.idParam), divisionController.getById);
router.post('/', requireRole(ROLES.ADMIN), requirePermission('cadDrawing'), validate(divisionValidator.create), divisionController.create);
router.put('/:id', requireRole(ROLES.ADMIN), requirePermission('cadDrawing'), validate(divisionValidator.update), divisionController.update);
router.delete('/:id', requireRole(ROLES.ADMIN), requirePermission('cadDrawing'), validate(divisionValidator.idParam), divisionController.remove);

module.exports = router;
