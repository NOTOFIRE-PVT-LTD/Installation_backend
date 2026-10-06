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
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

quotationMasterSchema.index({ kind: 1, name: 1 });

module.exports = mongoose.model('QuotationMaster', quotationMasterSchema);
module.exports.QUOTATION_MASTER_KINDS = QUOTATION_MASTER_KINDS;
