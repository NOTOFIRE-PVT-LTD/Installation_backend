const mongoose = require('mongoose');
const { LOA_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const nitItemSchema = new Schema(
  {
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const loaItemSchema = new Schema(
  {
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    loaType: {
      type: String,
      enum: Object.values(LOA_TYPES),
      required: true,
      default: LOA_TYPES.NOTOFIRE,
    },
  },
  { _id: true }
);

const nitTenderSchema = new Schema(
  {
    tenderName: { type: String, required: true, trim: true, index: true },
    nitNumber: { type: String, required: true, trim: true, index: true },
    nitDate: { type: Date, default: null },
    items: { type: [nitItemSchema], default: [] },
    loaNumber: { type: String, default: '', trim: true },
    loaDate: { type: Date, default: null },
    loaValue: { type: Number, default: 0, min: 0 },
    loaWorkCompletion: { type: Date, default: null },
    loaDivisionName: { type: String, default: '', trim: true },
    contractorName: { type: String, default: '', trim: true },
    loaItems: { type: [loaItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

nitTenderSchema.index({
  tenderName: 'text',
  nitNumber: 'text',
  loaNumber: 'text',
  loaDivisionName: 'text',
  contractorName: 'text',
});
nitTenderSchema.index({ createdAt: -1 });
nitTenderSchema.index({ nitDate: -1 });

module.exports = mongoose.model('NitTender', nitTenderSchema);
