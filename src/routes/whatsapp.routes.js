const express = require('express');
const whatsappController = require('../controllers/whatsapp.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('users'));

router.get('/logs', whatsappController.listLogs);
router.get('/status', whatsappController.getStatus);

module.exports = router;
