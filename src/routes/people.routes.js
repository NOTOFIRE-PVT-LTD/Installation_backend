const express = require('express');
const peopleController = require('../controllers/people.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const peopleValidator = require('../validators/people.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('salespersonTracking'));

router.get('/', validate(peopleValidator.list), peopleController.list);
router.post('/', validate(peopleValidator.create), peopleController.create);
router.put('/:id', validate(peopleValidator.update), peopleController.update);
router.patch('/:id/status', validate(peopleValidator.updateStatus), peopleController.updateStatus);

module.exports = router;
