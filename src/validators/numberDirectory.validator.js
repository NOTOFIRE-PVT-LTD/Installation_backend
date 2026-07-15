const { body, param, query } = require('express-validator');
const { NUMBER_CATEGORIES } = require('../config/constants');

const create = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('number').trim().notEmpty().withMessage('Number is required'),
  body('region').trim().notEmpty().withMessage('Region is required'),
  body('category').isIn(Object.values(NUMBER_CATEGORIES)).withMessage('Invalid category'),
];

const update = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('name').optional().trim().notEmpty(),
  body('number').optional().trim().notEmpty(),
  body('region').optional().trim().notEmpty(),
];

const idParam = [param('id').isMongoId().withMessage('Invalid id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isIn(Object.values(NUMBER_CATEGORIES)),
];

const importFile = [body('category').isIn(Object.values(NUMBER_CATEGORIES)).withMessage('Invalid category')];

module.exports = { create, update, idParam, list, importFile };
