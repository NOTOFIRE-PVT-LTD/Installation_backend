const express = require('express');
const atlantaPaymentController = require('../controllers/atlantaPayment.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { uploadAtlantaPaymentProofs } = require('../middlewares/upload.middleware');
const ApiError = require('../utils/ApiError');

const router = express.Router();

const requireAtlantaPaymentAccess = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  const permissions = req.user.permissions;
  if (!permissions || !permissions.atlantaPayments) {
    return next(new ApiError(403, 'You do not have permission to access Atlanta Payments'));
  }
  next();
};

router.use(authenticate, requireAtlantaPaymentAccess);

router.get('/', atlantaPaymentController.list);
router.post('/', uploadAtlantaPaymentProofs, atlantaPaymentController.create);
router.get('/:id', atlantaPaymentController.getById);
router.put('/:id', uploadAtlantaPaymentProofs, atlantaPaymentController.update);
router.delete('/:id', atlantaPaymentController.remove);

module.exports = router;
