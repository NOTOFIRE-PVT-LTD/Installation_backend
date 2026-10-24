const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
      enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'STATUS_CHANGE', 'BULK_ACTION', 'RESTORE', 'OTHER'],
    },
    module: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: 'System',
      trim: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userRole: {
      type: String,
      default: '',
      trim: true,
    },
    entityId: {
      type: String,
      default: null,
      index: true,
    },
    entityName: {
      type: String,
      default: '',
      trim: true,
    },
    method: {
      type: String,
      default: '',
      trim: true,
    },
    endpoint: {
      type: String,
      default: '',
      trim: true,
    },
    statusCode: {
      type: Number,
      default: 200,
    },
    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
