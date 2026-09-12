const mongoose = require('mongoose');

const { Schema } = mongoose;

const BILLING_PARTIES = Object.freeze(['KE', 'AHT', 'Arihant']);

const loaItemSchema = new Schema(
  {
    sno: { type: Number, default: 0 },
    itemName: { type: String, default: '', trim: true },
    type: { type: String, default: 'SITC', trim: true },
    paymentTerms: { type: String, default: '80% + 10% + 10%', trim: true },
    inspection: { type: String, default: 'RDSO', trim: true },
    mfd: { type: String, default: 'NF', trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'Nos', trim: true },
    loaValuePerUnit: { type: Number, default: 0, min: 0 },
    loaTotal: { type: Number, default: 0, min: 0 },
    discountPerUnit: { type: Number, default: 0, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const billingInvoiceSchema = new Schema(
  {
    party: {
      type: String,
      enum: BILLING_PARTIES,
      required: true,
      index: true,
    },
    fileName: { type: String, default: '', trim: true },
    loaNumber: { type: String, default: '', trim: true },
    tenderValue: { type: Number, default: 0, min: 0 },
    loaValue: { type: Number, default: 0, min: 0 },
    docDate: { type: Date, default: null },
    discountPercent: { type: Number, default: 55.7 },
    items: { type: [loaItemSchema], default: [] },
    totalAfterDiscount: { type: Number, default: 0, min: 0 },
    excludingGst: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

billingInvoiceSchema.index({ party: 1, createdAt: -1 });
billingInvoiceSchema.index({ fileName: 'text', loaNumber: 'text' });

module.exports = mongoose.model('BillingInvoice', billingInvoiceSchema);
module.exports.BILLING_PARTIES = BILLING_PARTIES;
