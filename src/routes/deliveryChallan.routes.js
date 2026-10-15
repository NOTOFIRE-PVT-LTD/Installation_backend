const express = require('express');
const deliveryChallanController = require('../controllers/deliveryChallan.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const dcValidator = require('../validators/deliveryChallan.validator');
const { uploadDeliveryChallanFiles } = require('../middlewares/upload.middleware');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('deliveryChallans'));

router.get('/next-number', validate(dcValidator.nextNumber), deliveryChallanController.suggestNumbers);
router.get('/options/companies', deliveryChallanController.listCompanies);
router.get('/options/parties', deliveryChallanController.listParties);

router.get('/', validate(dcValidator.dcList), deliveryChallanController.listDeliveryChallans);
router.post('/', uploadDeliveryChallanFiles, deliveryChallanController.createDeliveryChallan);
router.get('/:id', validate(dcValidator.idParam), deliveryChallanController.getDeliveryChallanById);
router.put(
  '/:id',
  uploadDeliveryChallanFiles,
  validate(dcValidator.idParam),
  deliveryChallanController.updateDeliveryChallan
);
router.delete('/:id', validate(dcValidator.idParam), deliveryChallanController.removeDeliveryChallan);

module.exports = router;
