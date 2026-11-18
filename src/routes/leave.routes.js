const express = require('express');
const leaveController = require('../controllers/leave.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermissionOrRole } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const leaveValidator = require('../validators/leave.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requirePermissionOrRole('attendance', ROLES.USER));

router.get('/', validate(leaveValidator.list), leaveController.list);
router.post('/', validate(leaveValidator.create), leaveController.create);
router.post('/:id/review', validate(leaveValidator.review), leaveController.review);

module.exports = router;
