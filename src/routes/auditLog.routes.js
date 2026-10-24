const express = require('express');
const auditLogController = require('../controllers/auditLog.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('auditLogs'));

router.get('/', auditLogController.list);
router.get('/stats', auditLogController.getStats);
router.get('/modules', auditLogController.getModules);
router.get('/:id', auditLogController.getById);

module.exports = router;
