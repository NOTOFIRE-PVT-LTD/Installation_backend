const express = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { uploadProfileImage } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const userValidator = require('../validators/user.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('users'));

router.get('/', validate(userValidator.list), userController.list);
router.get('/options', userController.options);
router.get('/:id', validate(userValidator.idParam), userController.getById);
router.post('/', uploadProfileImage, validate(userValidator.create), userController.create);
router.put('/:id', uploadProfileImage, validate(userValidator.update), userController.update);
router.delete('/:id', validate(userValidator.idParam), userController.remove);
router.patch('/:id/status', validate(userValidator.updateStatus), userController.updateStatus);
router.post('/:id/reset-password', validate(userValidator.idParam), userController.resetPassword);
router.put('/:id/permissions', validate(userValidator.updatePermissions), userController.updatePermissions);
router.post('/:id/impersonate', validate(userValidator.idParam), userController.impersonate);

module.exports = router;