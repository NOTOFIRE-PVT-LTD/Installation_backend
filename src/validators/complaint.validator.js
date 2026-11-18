const { body, param, query } = require('express-validator');
const {
  COMPLAINT_STATUS,
  COMPLAINT_PRIORITY,
  COMPLAINT_CATEGORY,
} = require('../config/constants');

const PUBLIC_PRIORITIES = [
  COMPLAINT_PRIORITY.LOW,
  COMPLAINT_PRIORITY.MEDIUM,
  COMPLAINT_PRIORITY.HIGH,
];

const publicCreate = [
  body('customerName')
    .trim()
    .notEmpty()
    .withMessage('Your name is required')
    .isLength({ max: 120 })
    .withMessage('Name is too long'),
  body('contactNumber')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[0-9+\-\s()]{7,20}$/)
    .withMessage('Enter a valid phone number'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Enter a valid email address')
    .isLength({ max: 160 }),
  body('companyName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('siteName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('location').optional({ values: 'falsy' }).trim().isLength({ max: 250 }),
  body('product').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('category')
    .isIn(Object.values(COMPLAINT_CATEGORY))
    .withMessage('Select a complaint category'),
  body('priority')
    .optional({ values: 'falsy' })
    .isIn(PUBLIC_PRIORITIES)
    .withMessage('Select a valid urgency'),
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ max: 160 })
    .withMessage('Subject is too long'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Please describe the issue')
    .isLength({ max: 5000 })
    .withMessage('Description is too long'),
];

const idParam = [param('id').isMongoId().withMessage('Invalid complaint id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(Object.values(COMPLAINT_STATUS)),
  query('priority').optional().isIn(Object.values(COMPLAINT_PRIORITY)),
  query('category').optional().isIn(Object.values(COMPLAINT_CATEGORY)),
  query('assignedTo').optional().isMongoId().withMessage('Invalid assignee'),
  query('overdue').optional().isIn(['true', 'false']),
];

const update = [
  param('id').isMongoId().withMessage('Invalid complaint id'),
  body('status').optional().isIn(Object.values(COMPLAINT_STATUS)),
  body('priority').optional().isIn(Object.values(COMPLAINT_PRIORITY)),
  body('category').optional().isIn(Object.values(COMPLAINT_CATEGORY)),
  body('assignedTo').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid assignee'),
  body('resolutionNotes').optional().isLength({ max: 5000 }).withMessage('Resolution notes are too long'),
  body('note').optional().isLength({ max: 2000 }).withMessage('Note is too long'),
  body('subject').optional().trim().isLength({ max: 160 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('customerName').optional().trim().isLength({ max: 120 }),
  body('contactNumber').optional().trim().isLength({ max: 30 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email address'),
  body('companyName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('siteName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('location').optional({ values: 'falsy' }).trim().isLength({ max: 250 }),
  body('product').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
];

module.exports = { publicCreate, idParam, list, update };
