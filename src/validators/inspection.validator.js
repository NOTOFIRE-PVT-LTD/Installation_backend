const { body, param, query } = require('express-validator');
const { INSPECTION_STATUS } = require('../config/constants');

const INSPECTION_CHARGE_BORN_BY = Object.freeze({
  RAILWAY: 'Railway',
  CONTRACTOR: 'Contractor',
});

const chargeOptions = Object.values(INSPECTION_CHARGE_BORN_BY);

const create = [
  body('tender').isMongoId().withMessage('Valid LOA tender is required'),

  body('inspectionDate').isISO8601().withMessage('Inspection date is required'),
  body('firmCallNo').trim().notEmpty().withMessage('Firm Call No. is required'),
  body('rdsoCallNo').trim().notEmpty().withMessage('RDSO Call No. is required'),
  body('inspectorName').trim().notEmpty().withMessage('Inspector name is required'),

  body('fireAlarmQty').isFloat({ min: 0 }).withMessage('Quantity of fire Alarm must be >= 0'),
  body('controlPanelQty').isFloat({ min: 0 }).withMessage('Quantity of Control Panel must be >= 0'),

  body('dmNo').trim().notEmpty().withMessage('DM No. is required'),
  body('doc').trim().notEmpty().withMessage('DOC is required'),
  body('consignee').trim().notEmpty().withMessage('Consignee is required'),
  body('orderingAuthority').trim().notEmpty().withMessage('Ordering Authority is required'),

  body('inspectionChargeBornBy')
    .isIn(chargeOptions)
    .withMessage('Inspection Charge Born By must be Railway or Contractor'),
  body('mersNo').custom((value, { req }) => {
    if (req.body.inspectionChargeBornBy === INSPECTION_CHARGE_BORN_BY.CONTRACTOR) {
      if (!value || !String(value).trim()) throw new Error('MERS No. is required when Inspection is Contractor-born');
    }
    return true;
  }),

  body('status').optional().isIn(Object.values(INSPECTION_STATUS)),
  body('remarks').optional().trim(),

  body('checklistItems').optional(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid inspection id'),

  body('tender').optional().isMongoId().withMessage('Valid LOA tender is required'),

  body('inspectionDate').optional().isISO8601(),
  body('firmCallNo').optional().trim().notEmpty(),
  body('rdsoCallNo').optional().trim().notEmpty(),
  body('inspectorName').optional().trim().notEmpty(),

  body('fireAlarmQty').optional().isFloat({ min: 0 }),
  body('controlPanelQty').optional().isFloat({ min: 0 }),

  body('dmNo').optional().trim().notEmpty(),
  body('doc').optional().trim().notEmpty(),
  body('consignee').optional().trim().notEmpty(),
  body('orderingAuthority').optional().trim().notEmpty(),

  body('inspectionChargeBornBy').optional().isIn(chargeOptions),
  body('mersNo').custom((value, { req }) => {
    if (req.body.inspectionChargeBornBy === INSPECTION_CHARGE_BORN_BY.CONTRACTOR) {
      if (!value || !String(value).trim()) throw new Error('MERS No. is required when Inspection is Contractor-born');
    }
    return true;
  }),

  body('status').optional().isIn(Object.values(INSPECTION_STATUS)),
  body('remarks').optional().trim(),

  body('checklistItems').optional(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid inspection id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('tender').optional().isMongoId(),
  query('status').optional().isIn(Object.values(INSPECTION_STATUS)),
];

module.exports = { create, update, idParam, list };
