const { body, param, query } = require('express-validator');
const { BG_TYPES, APPLICATION_TYPES, BG_NATURES } = require('../models/BgApplication.model');

const numberFields = ['bgTenorMonths', 'bgTenorDays', 'marginFdAmount', 'marginNewFdAmount', 'delayedPaymentInterestPercent'];
const dateFields = ['applicantDateOfIncorporation', 'beneficiaryDateOfIncorporation', 'expiryDate', 'claimExpiryDate', 'declarationDate'];

const create = [
  body('applicantNameAddress').trim().notEmpty().withMessage('Applicant name & address is required'),
  body('beneficiaryNameAddress').trim().notEmpty().withMessage('Beneficiary name & address is required'),
  body('typeOfBG').optional({ checkFalsy: true }).isIn(BG_TYPES).withMessage('Invalid type of BG'),
  body('typeOfApplication').optional({ checkFalsy: true }).isIn(APPLICATION_TYPES).withMessage('Invalid type of application'),
  body('natureOfBankGuarantee').optional({ checkFalsy: true }).isIn(BG_NATURES).withMessage('Invalid nature of bank guarantee'),
  ...numberFields.map((field) => body(field).optional().isFloat({ min: 0 }).withMessage(`${field} must be a positive number`)),
  ...dateFields.map((field) => body(field).optional({ checkFalsy: true }).isISO8601().withMessage(`${field} must be a valid date`)),
];

const update = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('applicantNameAddress').optional().trim().notEmpty(),
  body('beneficiaryNameAddress').optional().trim().notEmpty(),
  body('typeOfBG').optional({ checkFalsy: true }).isIn(BG_TYPES).withMessage('Invalid type of BG'),
  body('typeOfApplication').optional({ checkFalsy: true }).isIn(APPLICATION_TYPES).withMessage('Invalid type of application'),
  body('natureOfBankGuarantee').optional({ checkFalsy: true }).isIn(BG_NATURES).withMessage('Invalid nature of bank guarantee'),
  ...numberFields.map((field) => body(field).optional().isFloat({ min: 0 })),
  ...dateFields.map((field) => body(field).optional({ checkFalsy: true }).isISO8601()),
];

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('typeOfBG').optional().isIn(BG_TYPES),
];

module.exports = { create, update, idParam, list };
