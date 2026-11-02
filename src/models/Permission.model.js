const mongoose = require('mongoose');
const { PERMISSION_KEYS } = require('../config/constants');

const { Schema } = mongoose;

const DEFAULT_TRUE_PERMISSIONS = new Set(['salesTravelRequests']);

const permissionFields = PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = { type: Boolean, default: DEFAULT_TRUE_PERMISSIONS.has(key) };
  return acc;
}, {});

const permissionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    ...permissionFields,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
