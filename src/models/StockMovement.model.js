const mongoose = require('mongoose');
const { STOCK_MOVEMENT_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const stockMovementSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(STOCK_MOVEMENT_TYPES),
      required: true,
      index: true,
    },
    stockItem: { type: Schema.Types.ObjectId, ref: 'StockItem', required: true, index: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    amount: { type: Number, default: 0, min: 0 },
    movementDate: { type: Date, required: true, default: Date.now },
    supplierName: { type: String, default: '', trim: true },
    issuedTo: { type: String, default: '', trim: true, index: true },
    referenceNo: { type: String, default: '', trim: true },
    remarks: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ type: 1, stockItem: 1, createdAt: -1 });
stockMovementSchema.index({
  supplierName: 'text',
  issuedTo: 'text',
  referenceNo: 'text',
  remarks: 'text',
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);
