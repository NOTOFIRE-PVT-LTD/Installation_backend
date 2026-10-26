const models = require('../models/Payflow.model');

// Declarative definition of every Payflow master. Validators, the service and the routes
// are all generated from this, so adding a field only needs a change here + the model.
const PAYFLOW_RESOURCES = {
  vendors: {
    label: 'Vendor',
    model: models.PayflowVendor,
    fields: {
      name: { label: 'Vendor name', required: true, uppercase: true },
      accountNumber: {
        label: 'Account number',
        required: true,
        pattern: /^[A-Za-z0-9]{8,20}$/,
        message: 'Account number must be alphanumeric (8-20 characters)',
      },
      ifscCode: {
        label: 'IFSC code',
        required: true,
        uppercase: true,
        pattern: /^[A-Z0-9]{8,11}$/,
        message: 'IFSC code must be alphanumeric (8-11 characters)',
      },
    },
    unique: ['name'],
    searchFields: ['name', 'accountNumber', 'ifscCode'],
  },
  categories: {
    label: 'Category',
    model: models.PayflowCategory,
    fields: {
      name: { label: 'Category name', required: true },
      description: { label: 'Description', required: false },
    },
    unique: ['name'],
    searchFields: ['name', 'description'],
  },
  subcategories: {
    label: 'Subcategory',
    model: models.PayflowSubcategory,
    fields: {
      name: { label: 'Subcategory name', required: true },
      description: { label: 'Description', required: false },
    },
    unique: ['name'],
    searchFields: ['name', 'description'],
  },
  companies: {
    label: 'Company',
    model: models.PayflowCompany,
    fields: {
      name: { label: 'Company name', required: true },
      code: {
        label: 'Company code',
        required: true,
        uppercase: true,
        pattern: /^[A-Z0-9]{1,10}$/,
        message: 'Code must be uppercase letters and numbers only (max 10 characters)',
      },
    },
    unique: ['name', 'code'],
    searchFields: ['name', 'code'],
  },
  branches: {
    label: 'Branch',
    model: models.PayflowBranch,
    fields: {
      name: { label: 'Branch name', required: true },
      code: {
        label: 'Branch code',
        required: true,
        uppercase: true,
        pattern: /^[A-Z]{1,10}$/,
        message: 'Code must be uppercase letters only (max 10 characters)',
      },
    },
    unique: ['name', 'code'],
    searchFields: ['name', 'code'],
  },
};

module.exports = { PAYFLOW_RESOURCES };
