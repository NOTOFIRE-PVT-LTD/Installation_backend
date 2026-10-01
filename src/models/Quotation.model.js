const mongoose = require('mongoose');

const { Schema } = mongoose;

const QUOTATION_STATUSES = Object.freeze(['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

const contactSnapshotSchema = new Schema(
  {
    ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
    name: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const quotationItemSchema = new Schema(
  {
    lineType: { type: String, enum: ['main', 'sub'], default: 'main' },
    masterItem: { type: Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    modelNo: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    qty: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: 'Nos', trim: true },
    price: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const quotationSchema = new Schema(
  {
    quotationNo: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, required: true },
    seqYear: { type: Number, required: true },
    quotationDate: { type: Date, default: Date.now },
    company: { type: contactSnapshotSchema, default: () => ({}) },
    party: { type: contactSnapshotSchema, default: () => ({}) },
    salesperson: { type: String, default: '', trim: true },
    projectName: { type: String, default: '', trim: true },
    preparedBy: { type: String, default: '', trim: true },
    techSpecCheckedBy: { type: String, default: '', trim: true },
    checkedBy: { type: String, default: '', trim: true },
    items: { type: [quotationItemSchema], default: [] },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    gstRate: { type: Number, default: 18, min: 0 },
    packingFreight: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    afterDiscount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    terms: {
      ref: { type: Schema.Types.ObjectId, ref: 'QuotationMaster', default: null },
      title: { type: String, default: '', trim: true },
      content: { type: String, default: '', trim: true },
    },
    notes: { type: String, default: '', trim: true },
    status: { type: String, enum: QUOTATION_STATUSES, default: 'draft', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

quotationSchema.index({ seqYear: 1, seq: -1 });
quotationSchema.index({ isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);
module.exports.QUOTATION_STATUSES = QUOTATION_STATUSES;
