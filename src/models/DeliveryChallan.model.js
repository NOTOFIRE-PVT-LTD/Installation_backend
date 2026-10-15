const mongoose = require('mongoose');

const { Schema } = mongoose;

const dcItemSchema = new Schema(
  {
    name: { type: String, default: '', trim: true },
    hsnCode: { type: String, default: '', trim: true },
    qty: { type: Number, default: 0, min: 0 },
    uom: { type: String, default: 'Nos', trim: true },
    rate: { type: Number, default: 0, min: 0 },
    value: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const dcAttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: '', trim: true },
    type: { type: String, default: '', trim: true },
    size: { type: Number, default: 0 },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: '' },
  },
  { _id: true }
);

const deliveryChallanSchema = new Schema(
  {
    legacySupabaseId: { type: String, default: null, index: true },
    sellerCompany: { type: String, enum: ['notofire', 'valuecon'], default: 'notofire',required: true},
    dcNumber: { type: String, required: true, unique: true, trim: true },
    // Number without its running counter, e.g. "NF/UP/26-27" for NF/UP/26-27/261.
    series: { type: String, default: '', trim: true },
    seq: { type: Number, default: null },
    dcDate: { type: Date, default: Date.now },
    company: {
      ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
      name: { type: String, default: '', trim: true },
      code: { type: String, default: '', trim: true },
      gstin: { type: String, default: '', trim: true },
      cin: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
    },
    receiverName: { type: String, default: '', trim: true },
    receiverNumber: { type: String, default: '', trim: true },
    recipient: {
      ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
      name: { type: String, default: '', trim: true },
      gstin: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
    },
    placeOfSupply: { type: String, default: '', trim: true },
    deliveryAddress: { type: String, default: '', trim: true },
    items: { type: [dcItemSchema], default: [] },
    totalValue: { type: Number, default: 0 },
    amountInWords: { type: String, default: '', trim: true },
    rateOfTax: { type: String, default: 'GST not applicable', trim: true },
    taxAmount: { type: Number, default: 0, min: 0 },
    modeOfDispatch: { type: String, default: '', trim: true },
    vehicleTransporter: { type: String, default: '', trim: true },
    expectedDuration: { type: String, default: '', trim: true },
    originalInvoiceRef: { type: String, default: '', trim: true },
    panelNo: { type: String, default: '', trim: true },
    complaintNo: { type: String, default: '', trim: true },
    fault: { type: String, default: '', trim: true },
    approvedBy: { type: String, default: '', trim: true },
    requestedBy: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    attachments: { type: [dcAttachmentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

deliveryChallanSchema.index({ series: 1, seq: -1 });
deliveryChallanSchema.index({ dcDate: -1, createdAt: -1 });

module.exports = mongoose.model('DeliveryChallan', deliveryChallanSchema);
