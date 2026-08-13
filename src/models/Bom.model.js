const mongoose = require('mongoose');
const { BOM_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const bomComponentSchema = new Schema(
  {
    stockItem: { type: Schema.Types.ObjectId, ref: 'StockItem', required: true },
    partNo: { type: String, default: '', trim: true },
    package: { type: String, default: '', trim: true },
    vendor: { type: String, default: '', trim: true },
    qtyPerPcs: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, default: 'Nos', trim: true },
    remarks: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const bomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    finishedItem: { type: Schema.Types.ObjectId, ref: 'StockItem', default: null },
    bomType: {
      type: String,
      enum: Object.values(BOM_TYPES),
      required: true,
      default: BOM_TYPES.STANDARD,
    },
    version: { type: String, required: true, trim: true, default: '1.0' },
    effectiveDate: { type: Date, default: Date.now },
    remarks: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true, index: true },
    components: { type: [bomComponentSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bomSchema.index({ name: 'text', version: 'text', remarks: 'text' });
bomSchema.index({ name: 1, version: 1 });
bomSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Bom', bomSchema);
