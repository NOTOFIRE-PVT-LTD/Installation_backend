const mongoose = require('mongoose');

const { Schema } = mongoose;

const callLetterSchema = new Schema(
  {
    tender: { type: Schema.Types.ObjectId, ref: 'NitTender', required: true, index: true },
    contractAgreement: { type: Schema.Types.ObjectId, ref: 'ContractAgreement', default: null },

    // Snapshot for stable display.
    tenderName: { type: String, default: '', trim: true },

    zone: { type: String, required: true, trim: true },
    callLetter: { type: String, required: true, trim: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

callLetterSchema.index({ callLetter: 'text', tenderName: 'text', zone: 'text' });
callLetterSchema.index({ createdAt: -1 });
callLetterSchema.index({ tender: 1, createdAt: -1 });

module.exports = mongoose.model('CallLetter', callLetterSchema);
