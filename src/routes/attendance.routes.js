const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermissionOrRole } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const { uploadAttendancePhoto } = require('../middlewares/upload.middleware');
const attendanceValidator = require('../validators/attendance.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requirePermissionOrRole('attendance', ROLES.USER));

router.get('/', validate(attendanceValidator.list), attendanceController.list);
router.get('/today', attendanceController.today);
router.get('/summary', attendanceController.summary);
router.post('/punch', uploadAttendancePhoto, validate(attendanceValidator.punch), attendanceController.punch);
router.get('/corrections', validate(attendanceValidator.correctionsList), attendanceController.listCorrections);
router.post('/corrections', validate(attendanceValidator.correction), attendanceController.requestCorrection);
router.post('/corrections/:id/review', validate(attendanceValidator.review), attendanceController.reviewCorrection);

module.exports = router;
