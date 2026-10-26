const express = require('express');
const visitExpenseController = require('../controllers/visitExpense.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requirePermissionOrRole } = require('../middlewares/permission.middleware');
const { uploadExpenseTicket } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validate.middleware');
const visitExpenseValidator = require('../validators/visitExpense.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requirePermissionOrRole('attendance', ROLES.USER));

router.get('/', validate(visitExpenseValidator.list), visitExpenseController.list);
router.get('/:id', validate(visitExpenseValidator.idParam), visitExpenseController.getById);
router.patch('/:id', validate(visitExpenseValidator.update), visitExpenseController.updateDraft);
router.post(
  '/:id/items/:itemId/ticket',
  uploadExpenseTicket,
  validate(visitExpenseValidator.itemParam),
  visitExpenseController.attachTicket
);
router.post('/:id/submit', validate(visitExpenseValidator.idParam), visitExpenseController.submit);
router.post('/:id/review', validate(visitExpenseValidator.review), visitExpenseController.review);

module.exports = router;
