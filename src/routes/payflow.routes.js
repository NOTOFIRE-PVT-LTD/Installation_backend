const express = require('express');
const { buildController } = require('../controllers/payflow.controller');
const { buildValidator } = require('../validators/payflow.validator');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const { PAYFLOW_RESOURCES } = require('../config/payflow.config');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('payflow'));

// /payment-requests — list, stats, detail, create and status changes.
router.use('/payment-requests', require('./payflowPaymentRequest.routes'));

// Mounts /vendors, /categories, /subcategories, /companies and /branches.
Object.keys(PAYFLOW_RESOURCES).forEach((resource) => {
  const controller = buildController(resource);
  const validator = buildValidator(resource);
  const sub = express.Router();

  sub.get('/', validate(validator.list), controller.list);
  sub.get('/:id', validate(validator.idParam), controller.getById);
  sub.post('/', validate(validator.create), controller.create);
  sub.put('/:id', validate(validator.update), controller.update);
  sub.delete('/:id', validate(validator.idParam), controller.remove);

  router.use(`/${resource}`, sub);
});

module.exports = router;
