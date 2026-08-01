const { body, param, query } = require('express-validator');
const { LOA_TYPES } = require('../config/constants');

const create = [
  body('tender').isMongoId().withMessage('Valid LOA tender is required'),
  body('bgNumber').trim().notEmpty().withMessage('BG Number is required'),
  body('partyName').isIn(Object.values(LOA_TYPES)).withMessage('Party Name must be Notofire or Third Party'),
  body('bgAmount').isFloat({ min: 0 }).withMessage('BG Amount must be >= 0'),
  body('bgDispatch').optional({ checkFalsy: true }).isISO8601(),
  body('bgSubmission').optional({ checkFalsy: true }).isISO8601(),
  body('bgVerify').optional({ checkFalsy: true }).isISO8601(),
];

const update = [
  param('id').isMongoId().withMessage('Invalid financial document id'),
  body('tender').optional().isMongoId().withMessage('Valid LOA tender is required'),
  body('bgNumber').optional().trim().notEmpty().withMessage('BG Number is required'),
  body('partyName').optional().isIn(Object.values(LOA_TYPES)),
  body('bgAmount').optional().isFloat({ min: 0 }),
  body('bgDispatch').optional({ checkFalsy: true }).isISO8601(),
  body('bgSubmission').optional({ checkFalsy: true }).isISO8601(),
  body('bgVerify').optional({ checkFalsy: true }).isISO8601(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid financial document id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('tender').optional().isMongoId(),
  query('partyName').optional().isIn(Object.values(LOA_TYPES)),
];

module.exports = { create, update, idParam, list };
