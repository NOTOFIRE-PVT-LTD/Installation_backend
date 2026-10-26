const express = require('express');
const visitController = require('../controllers/visit.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermission, requirePermissionOrRole } = require('../middlewares/permission.middleware');
const { uploadVisitPhoto } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const visitValidator = require('../validators/visit.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requirePermissionOrRole('attendance', ROLES.USER));

router.get('/approvals', validate(visitValidator.approvals), visitController.listApprovals);
router.post(
  '/approvals/:id/review',
  requirePermission('salespersonTracking'),
  validate(visitValidator.review),
  visitController.reviewApproval
);

router.get('/', validate(visitValidator.list), visitController.list);
router.get('/today', visitController.today);
router.get('/day', visitController.getDay);
router.post('/day', validate(visitValidator.selectDay), visitController.selectDay);
router.post('/day/submit', visitController.submitDay);
router.post('/', validate(visitValidator.create), visitController.create);
router.get('/:id/proximity', validate(visitValidator.proximity), visitController.proximity);
router.get('/:id', validate(visitValidator.idParam), visitController.getById);
router.post('/:id/check-in', uploadVisitPhoto, validate(visitValidator.check), visitController.checkIn);
router.post('/:id/check-out', uploadVisitPhoto, validate(visitValidator.check), visitController.checkOut);
router.post('/:id/miss', validate(visitValidator.miss), visitController.reportMissed);

module.exports = router;
