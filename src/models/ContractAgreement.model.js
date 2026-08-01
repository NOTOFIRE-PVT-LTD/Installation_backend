const mongoose = require('mongoose');

const { Schema } = mongoose;

const contractAgreementSchema = new Schema(
  {
    tender: { type: Schema.Types.ObjectId, ref: 'NitTender', required: true, index: true },
    financialDocument: { type: Schema.Types.ObjectId, ref: 'FinancialDocument', default: null },

    // Snapshot for stable display.
    tenderName: { type: String, default: '', trim: true },

    caDate: { type: Date, required: true },
    caNumber: { type: String, required: true, trim: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

contractAgreementSchema.index({ caNumber: 'text', tenderName: 'text' });
contractAgreementSchema.index({ createdAt: -1 });
contractAgreementSchema.index({ tender: 1, createdAt: -1 });

module.exports = mongoose.model('ContractAgreement', contractAgreementSchema);
