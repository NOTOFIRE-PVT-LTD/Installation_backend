const mongoose = require('mongoose');
const { LOA_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const financialDocumentSchema = new Schema(
  {
    tender: { type: Schema.Types.ObjectId, ref: 'NitTender', required: true, index: true },

    // Snapshot LOA / tender info for stable display even if Tender changes later.
    tenderName: { type: String, default: '', trim: true },
    loaNumber: { type: String, default: '', trim: true },
    loaDate: { type: Date, default: null },

    bgNumber: { type: String, required: true, trim: true },
    partyName: {
      type: String,
      enum: Object.values(LOA_TYPES),
      required: true,
      default: LOA_TYPES.NOTOFIRE,
    },
    bgAmount: { type: Number, required: true, min: 0, default: 0 },

    // Auto-calculated from LOA Date: +21 days and +60 days.
    bgDeadline21: { type: Date, default: null },
    bgDeadline60: { type: Date, default: null },

    bgDispatch: { type: Date, default: null },
    bgSubmission: { type: Date, default: null },
    bgVerify: { type: Date, default: null },

    // Set when the LOA+14 day WhatsApp reminder has been sent (prevents duplicates).
    bgReminder14SentAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

financialDocumentSchema.index({ bgNumber: 'text', tenderName: 'text', loaNumber: 'text', partyName: 'text' });
financialDocumentSchema.index({ createdAt: -1 });
financialDocumentSchema.index({ bgDeadline21: 1 });
financialDocumentSchema.index({ bgDeadline60: 1 });
financialDocumentSchema.index({ loaDate: 1, bgReminder14SentAt: 1 });

module.exports = mongoose.model('FinancialDocument', financialDocumentSchema);
