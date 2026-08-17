const { body, param, query } = require('express-validator');

const bomList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('isActive').optional().isIn(['true', 'false']),
];

const bomIdParam = [param('id').isMongoId().withMessage('Invalid BOM id')];

const componentValidators = [
  body('components').optional().isArray(),
  body('components.*.stockItem').optional().isMongoId(),
  body('components.*.qtyPerPcs').optional().isFloat({ gt: 0 }),
];

const bomCreate = [
  body('name').trim().notEmpty().withMessage('BOM name is required'),
  body('finishedItem').optional({ checkFalsy: true }).isMongoId(),
  body('version').optional().trim(),
  body('effectiveDate').optional({ checkFalsy: true }).isISO8601(),
  body('remarks').optional().trim(),
  body('isActive').optional().isBoolean(),
  ...componentValidators,
];

const bomUpdate = [
  param('id').isMongoId().withMessage('Invalid BOM id'),
  body('name').optional().trim().notEmpty(),
  body('finishedItem').optional({ checkFalsy: true }).isMongoId(),
  body('version').optional().trim(),
  body('effectiveDate').optional({ checkFalsy: true }).isISO8601(),
  body('remarks').optional().trim(),
  body('isActive').optional().isBoolean(),
  ...componentValidators,
];

const productionPreview = [
  body('bom').isMongoId().withMessage('BOM is required'),
  body('productionQty').isFloat({ gt: 0 }).withMessage('Production quantity must be greater than 0'),
];

const productionConfirm = [
  body('bom').isMongoId().withMessage('BOM is required'),
  body('productionQty').isFloat({ gt: 0 }).withMessage('Production quantity must be greater than 0'),
  body('person').trim().notEmpty().withMessage('Person name is required'),
  body('productionDate').optional({ checkFalsy: true }).isISO8601(),
  body('referenceNo').optional().trim(),
  body('remarks').optional().trim(),
];

const productionList = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('bom').optional().isMongoId(),
  query('person').optional().trim(),
];

const productionIdParam = [param('id').isMongoId().withMessage('Invalid production id')];

module.exports = {
  bomList,
  bomIdParam,
  bomCreate,
  bomUpdate,
  productionPreview,
  productionConfirm,
  productionList,
  productionIdParam,
};
