const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('dashboard'));

router.get('/stats', dashboardController.stats);
router.get('/project-progress', dashboardController.projectProgress);
router.get('/projects-overview', dashboardController.projectsOverview);
router.get('/daily-feed', dashboardController.dailyFeed);
router.get('/recent-reports', dashboardController.recentReports);
router.get('/recent-activity', dashboardController.recentActivity);

module.exports = router;
