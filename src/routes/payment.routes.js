const express = require('express');
const paymentController = require('../controllers/payment.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const paymentValidator = require('../validators/payment.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('payments'));

router.get('/', validate(paymentValidator.list), paymentController.list);
router.get('/:id', validate(paymentValidator.idParam), paymentController.getById);
router.post('/', validate(paymentValidator.create), paymentController.create);
router.put('/:id', validate(paymentValidator.update), paymentController.update);
router.delete('/:id', validate(paymentValidator.idParam), paymentController.remove);
router.patch('/:id/status', validate(paymentValidator.updateStatus), paymentController.updateStatus);

module.exports = router;
