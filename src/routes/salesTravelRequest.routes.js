const express = require('express');
const salesTravelRequestController = require('../controllers/salesTravelRequest.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { uploadSalesTravelProofs } = require('../middlewares/upload.middleware');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/constants');

const router = express.Router();

const requireSalesTravelAccess = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  const permissions = req.user.permissions;
  if (!permissions || !permissions.salesTravelRequests) {
    return next(new ApiError(403, 'You do not have permission to access Sales Travel Requests'));
  }
  next();
};

router.use(authenticate, requireSalesTravelAccess);

router.get('/', salesTravelRequestController.list);
router.post('/', uploadSalesTravelProofs, salesTravelRequestController.create);
router.get('/:id', salesTravelRequestController.getById);
router.put('/:id', uploadSalesTravelProofs, salesTravelRequestController.update);
router.patch('/:id/status', salesTravelRequestController.updateStatus);
router.delete('/:id', salesTravelRequestController.remove);

module.exports = router;

