const express = require('express');
const { buildController } = require('../controllers/payflow.controller');
const { buildValidator } = require('../validators/payflow.validator');
const authenticate = require('../middlewares/authenticate.middleware');
const validate = require('../middlewares/validate.middleware');
const ApiError = require('../utils/ApiError');
const { PAYFLOW_RESOURCES } = require('../config/payflow.config');
const { ROLES } = require('../config/constants');

const router = express.Router();

// 'payflowUser' (any role)     -> submit / read own requests, read-only masters ("user").
// Admin + 'payflow' permission  -> full access ("admin").
function resolvePayflowAccess(req, _res, next) {
  const permissions = req.user?.permissions;
  if (permissions?.payflowUser) req.payflowAccess = 'user';
  else if (req.user?.role === ROLES.ADMIN && permissions?.payflow) req.payflowAccess = 'admin';
  else return next(new ApiError(403, 'You do not have the "payflow" permission'));
  return next();
}

// Payflow users may read the masters (vendor / company / ... pickers) but never change them.
function masterWriteGuard(req, _res, next) {
  if (req.payflowAccess === 'admin' || req.method === 'GET') return next();
  return next(new ApiError(403, 'You do not have permission to perform this action'));
}

router.use(authenticate, resolvePayflowAccess);

// /payment-requests — list, stats, detail, create and status changes.
router.use('/payment-requests', require('./payflowPaymentRequest.routes'));

// Mounts /vendors, /categories, /subcategories, /companies and /branches.
Object.keys(PAYFLOW_RESOURCES).forEach((resource) => {
  const controller = buildController(resource);
  const validator = buildValidator(resource);
  const sub = express.Router();

  sub.use(masterWriteGuard);
  sub.get('/', validate(validator.list), controller.list);
  sub.get('/:id', validate(validator.idParam), controller.getById);
  sub.post('/', validate(validator.create), controller.create);
  sub.put('/:id', validate(validator.update), controller.update);
  sub.delete('/:id', validate(validator.idParam), controller.remove);

  router.use(`/${resource}`, sub);
});

module.exports = router;
