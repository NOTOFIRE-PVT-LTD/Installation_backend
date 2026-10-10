const mongoose = require('mongoose');

const { Schema } = mongoose;

const PI_TEMPLATES = Object.freeze(['standard']);

const piItemSchema = new Schema(
  {
    description: { type: String, default: '', trim: true },
    modelNo: { type: String, default: '', trim: true },
    qty: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: 'Nos', trim: true },
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const proformaInvoiceSchema = new Schema(
  {
    legacySupabaseId: { type: String, default: null, index: true },
    piNumber: { type: String, required: true, unique: true, trim: true },
    companyCode: { type: String, default: '', trim: true },
    fiscalYear: { type: String, default: '', trim: true },
    seq: { type: Number, default: null },
    piDate: { type: Date, default: Date.now },
    template: { type: String, enum: PI_TEMPLATES, default: 'standard' },
    company: {
      ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
      name: { type: String, default: '', trim: true },
      gstin: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
    },
    poNumber: { type: String, default: '', trim: true },
    party: {
      ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
      name: { type: String, default: '', trim: true },
      gstin: { type: String, default: '', trim: true },
    },
    deliveryAddress: { type: String, default: '', trim: true },
    quotation: {
      ref: { type: Schema.Types.ObjectId, ref: 'Quotation', default: null },
      quotationNo: { type: String, default: '', trim: true },
    },
    items: { type: [piItemSchema], default: [] },
    freight: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 18, min: 0 },
    totalExGst: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    terms: { type: String, default: '', trim: true },
    bank: {
      accountName: { type: String, default: '', trim: true },
      accountNo: { type: String, default: '', trim: true },
      bankName: { type: String, default: '', trim: true },
      ifsc: { type: String, default: '', trim: true },
      branch: { type: String, default: '', trim: true },
    },
    preparedBy: { type: String, default: '', trim: true },
    checkedBy: { type: String, default: '', trim: true },
    kindAttention: { type: String, default: '', trim: true },
    remarks: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

proformaInvoiceSchema.index({ companyCode: 1, fiscalYear: 1, seq: -1 });
proformaInvoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ProformaInvoice', proformaInvoiceSchema);
module.exports.PI_TEMPLATES = PI_TEMPLATES;
