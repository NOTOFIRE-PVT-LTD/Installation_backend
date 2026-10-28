const express = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/payflowPaymentRequest.controller');
const validate = require('../middlewares/validate.middleware');
const { PAYMENT_REQUEST_STATUSES, PAYMENT_PRIORITIES } = require('../models/PayflowPaymentRequest.model');
const ApiError = require('../utils/ApiError');

const router = express.Router();

// Payflow users (User role) may only submit and read their own requests.
const adminOnly = (req, _res, next) =>
  req.payflowAccess === 'admin' ? next() : next(new ApiError(403, 'You do not have permission to perform this action'));

const idParam = param('id').isMongoId().withMessage('Invalid payment request id');

const requiredText = (field, label) => body(field).trim().notEmpty().withMessage(`${label} is required`);
const personRule = (field, label, required = false) => {
  const chain = body(`${field}.name`);
  return required ? chain.trim().notEmpty().withMessage(`${label} is required`) : chain.optional({ values: 'falsy' }).trim();
};

const createRules = [
  requiredText('company', 'Company'),
  requiredText('branch', 'Branch'),
  requiredText('vendor', 'Vendor'),
  requiredText('category', 'Category'),
  requiredText('subcategory', 'Sub-category'),
  requiredText('itemType', 'Item type'),
  requiredText('bankName', 'Bank name'),
  requiredText('paymentMode', 'Payment mode'),
  requiredText('payAgainst', 'Pay against'),
  requiredText('description', 'Item description'),
  personRule('priceCheckBy', 'Price check guaranteed by', true),
  personRule('quantityCheckedBy', 'Quantity checked by'),
  personRule('qualityCheckedBy', 'Quality checked by'),
  personRule('purchaseOwner', 'Purchase owner'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number').toFloat(),
  body('totalOutstanding').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body('cpp').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('CPP must be a number of days'),
  body('priority').optional().isIn(PAYMENT_PRIORITIES).withMessage('Invalid priority'),
  body('bills').isArray({ min: 1 }).withMessage('At least one bill is required'),
  body('bills.*.billNumber').trim().notEmpty().withMessage('Bill number is required'),
  body('bills.*.billDate').isISO8601().withMessage('Bill date is required'),
  body('attachments').optional().isArray({ max: 20 }).withMessage('Too many attachments'),
  body('attachments.*.url').optional().isURL().withMessage('Invalid attachment url'),
];

const statusRules = [
  idParam,
  body('status').isIn(PAYMENT_REQUEST_STATUSES).withMessage('Invalid status'),
  body('remark').optional().isString().isLength({ max: 500 }),
];

const listRules = [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 100 })];

router.get('/stats', adminOnly, controller.stats);
const exportRules = [
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid start date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid end date'),
];
router.get('/export/summary', adminOnly, validate(exportRules), controller.exportSummary);
router.get('/export/excel', adminOnly, validate(exportRules), controller.exportExcel);
router.post(
  '/funds',
  adminOnly,
  validate([
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0').toFloat(),
    body('note').optional().isString().isLength({ max: 200 }),
  ]),
  controller.addFund
);
router.get('/user-options', controller.userOptions);
router.get('/', validate(listRules), controller.list);
router.post('/', validate(createRules), controller.create);
router.get('/:id', validate([idParam]), controller.getById);
router.patch('/:id/status', adminOnly, validate(statusRules), controller.changeStatus);

module.exports = router;
