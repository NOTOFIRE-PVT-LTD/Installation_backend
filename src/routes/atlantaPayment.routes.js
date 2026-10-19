const express = require('express');
const atlantaPaymentController = require('../controllers/atlantaPayment.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const { uploadAtlantaPaymentProofs } = require('../middlewares/upload.middleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('atlantaPayments'));

router.get('/', atlantaPaymentController.list);
router.post('/', uploadAtlantaPaymentProofs, atlantaPaymentController.create);
router.get('/:id', atlantaPaymentController.getById);
router.put('/:id', uploadAtlantaPaymentProofs, atlantaPaymentController.update);
router.delete('/:id', atlantaPaymentController.remove);

module.exports = router;
