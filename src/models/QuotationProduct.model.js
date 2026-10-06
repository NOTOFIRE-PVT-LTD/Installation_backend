const mongoose = require('mongoose');

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: 'image' },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

/** Product catalogue used when building quotations (alongside Items Master). */
const quotationProductSchema = new Schema(
  {
    legacySupabaseId: { type: String, default: null, index: true},
    modelNo: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    price: { type: Number, default: 0, min: 0 },
    category: { type: String, default: '', trim: true },
    unit: { type: String, default: 'Nos', trim: true },
    approvals: { type: String, default: '', trim: true },
    datasheet: { type: fileSchema, default: null },
    picture: { type: fileSchema, default: null },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

quotationProductSchema.index({ modelNo: 1 });

module.exports = mongoose.model('QuotationProduct', quotationProductSchema);
