const mongoose = require('mongoose');
const { VISIT_APPROVAL_DECISION, VISIT_EXCEPTION_KIND, MISSED_VISIT_REASONS } = require('../config/constants');

const { Schema } = mongoose;

const visitApprovalSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', required: true, index: true },
    kind: {
      type: String,
      enum: Object.values(VISIT_EXCEPTION_KIND),
      default: VISIT_EXCEPTION_KIND.MISSED,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decision: {
      type: String,
      enum: Object.values(VISIT_APPROVAL_DECISION),
      default: VISIT_APPROVAL_DECISION.PENDING,
      index: true,
    },
    missedReason: { type: String, enum: MISSED_VISIT_REASONS, required: true },
    missedExplanation: { type: String, default: '', trim: true },
    rejectionReason: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

visitApprovalSchema.index({ decision: 1, requestedAt: -1 });

module.exports = mongoose.model('VisitApproval', visitApprovalSchema);
