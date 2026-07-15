const express = require('express');
const projectController = require('../controllers/project.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const { uploadProjectFiles, uploadStationPhotos, uploadDailyReportPhotos } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const projectValidator = require('../validators/project.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermissionOrRole('projects', ROLES.USER), validate(projectValidator.list), projectController.list);
router.get('/options', requirePermissionOrRole('projects', ROLES.USER), projectController.options);
router.get('/approvals/queue', requireRole(ROLES.ADMIN), requirePermission('projects'), projectController.approvalsQueue);
router.get('/:id', requirePermissionOrRole('projects', ROLES.USER), validate(projectValidator.idParam), projectController.getById);

router.post(
  '/',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  uploadProjectFiles,
  validate(projectValidator.create),
  projectController.create
);
router.put(
  '/:id',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  uploadProjectFiles,
  validate(projectValidator.update),
  projectController.update
);
router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  validate(projectValidator.idParam),
  projectController.remove
);

router.post(
  '/:id/stations',
  requirePermissionOrRole('projects', ROLES.USER),
  uploadStationPhotos,
  validate(projectValidator.createStation),
  projectController.addStation
);
router.put(
  '/:id/stations/:stationId',
  requirePermissionOrRole('projects', ROLES.USER),
  uploadStationPhotos,
  validate(projectValidator.updateStation),
  projectController.updateStation
);
router.delete(
  '/:id/stations/:stationId',
  requirePermissionOrRole('projects', ROLES.USER),
  validate(projectValidator.stationIdParam),
  projectController.removeStation
);

router.post(
  '/:id/stations/:stationId/claim/submit',
  requirePermissionOrRole('projects', ROLES.USER),
  validate(projectValidator.stationIdParam),
  projectController.submitStationClaim
);
router.post(
  '/:id/stations/:stationId/claim/approve',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  validate(projectValidator.stationIdParam),
  projectController.approveStationClaim
);
router.post(
  '/:id/stations/:stationId/claim/reject',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  validate(projectValidator.stationIdParam),
  projectController.rejectStationClaim
);
router.post(
  '/:id/stations/:stationId/claim/mark-paid',
  requireRole(ROLES.ADMIN),
  requirePermission('projects'),
  validate(projectValidator.stationIdParam),
  projectController.markStationPaid
);

router.post(
  '/:id/stations/:stationId/daily-reports',
  requirePermissionOrRole('projects', ROLES.USER),
  uploadDailyReportPhotos,
  validate(projectValidator.createStationDailyReport),
  projectController.addStationDailyReport
);
router.delete(
  '/:id/stations/:stationId/daily-reports/:reportId',
  requirePermissionOrRole('projects', ROLES.USER),
  validate(projectValidator.stationDailyReportIdParam),
  projectController.removeStationDailyReport
);

router.post(
  '/:id/daily-reports',
  requirePermissionOrRole('projects', ROLES.USER),
  uploadDailyReportPhotos,
  validate(projectValidator.createDailyReport),
  projectController.addDailyReport
);
router.delete(
  '/:id/daily-reports/:reportId',
  requirePermissionOrRole('projects', ROLES.USER),
  validate(projectValidator.dailyReportIdParam),
  projectController.removeDailyReport
);

module.exports = router;
