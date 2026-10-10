const mongoose = require('mongoose');

const { Schema } = mongoose;

const QUOTATION_MASTER_KINDS = Object.freeze(['company', 'party', 'terms']);

/** Companies (quoting entity), parties (customers) and terms & conditions templates used by quotations. */
const quotationMasterSchema = new Schema(
  {
    legacySupabaseId: { type: String, default: null, index: true},
    kind: { type: String, enum: QUOTATION_MASTER_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    gstin: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    content: { type: String, default: '', trim: true },
    // Company only: prefix used in Proforma Invoice numbers (e.g. NF -> NF/PI/...) and bank details printed on PIs.
    code: { type: String, default: '', trim: true },
    bank: {
      accountName: { type: String, default: '', trim: true },
      accountNo: { type: String, default: '', trim: true },
      bankName: { type: String, default: '', trim: true },
      ifsc: { type: String, default: '', trim: true },
      branch: { type: String, default: '', trim: true },
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

quotationMasterSchema.index({ kind: 1, name: 1 });

module.exports = mongoose.model('QuotationMaster', quotationMasterSchema);
module.exports.QUOTATION_MASTER_KINDS = QUOTATION_MASTER_KINDS;
