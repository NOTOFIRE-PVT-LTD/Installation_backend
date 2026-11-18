const express = require('express');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const migratedAppController = require('../controllers/migratedApp.controller');

const router = express.Router();

router.use(authenticate, requirePermission('importControl'));

router.get('/dashboard', migratedAppController.importDashboard);
router.get('/tabs/:tab', migratedAppController.importTab);

module.exports = router;
