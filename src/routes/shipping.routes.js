const express = require('express');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const migratedAppController = require('../controllers/migratedApp.controller');

const router = express.Router();

router.use(authenticate, requirePermission('shipping'));

router.get('/dashboard', migratedAppController.shippingDashboard);
router.get('/tabs/:tab', migratedAppController.shippingTab);

module.exports = router;
