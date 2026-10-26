const express = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/payflowPaymentRequest.controller');
const validate = require('../middlewares/validate.middleware');
const { PAYMENT_REQUEST_STATUSES, PAYMENT_PRIORITIES } = require('../models/PayflowPaymentRequest.model');

const router = express.Router();

const idParam = param('id').isMongoId().withMessage('Invalid payment request id');

const createRules = [
  body('company').trim().notEmpty().withMessage('Company is required'),
  body('branch').trim().notEmpty().withMessage('Branch is required'),
  body('vendor').trim().notEmpty().withMessage('Vendor is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number').toFloat(),
  body('totalOutstanding').optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body('priority').optional().isIn(PAYMENT_PRIORITIES).withMessage('Invalid priority'),
  body('billDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid bill date'),
];

const statusRules = [
  idParam,
  body('status').isIn(PAYMENT_REQUEST_STATUSES).withMessage('Invalid status'),
  body('remark').optional().isString().isLength({ max: 500 }),
];

const listRules = [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 100 })];

router.get('/stats', controller.stats);
const exportRules = [
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid start date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid end date'),
];
router.get('/export/summary', validate(exportRules), controller.exportSummary);
router.get('/export/excel', validate(exportRules), controller.exportExcel);
router.post(
  '/funds',
  validate([
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0').toFloat(),
    body('note').optional().isString().isLength({ max: 200 }),
  ]),
  controller.addFund
);
router.get('/', validate(listRules), controller.list);
router.post('/', validate(createRules), controller.create);
router.get('/:id', validate([idParam]), controller.getById);
router.patch('/:id/status', validate(statusRules), controller.changeStatus);

module.exports = router;
