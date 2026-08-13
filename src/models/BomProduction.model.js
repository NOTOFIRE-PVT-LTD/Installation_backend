const mongoose = require('mongoose');

const { Schema } = mongoose;

const productionLineSchema = new Schema(
  {
    stockItem: { type: Schema.Types.ObjectId, ref: 'StockItem', required: true },
    itemName: { type: String, default: '' },
    qtyPerPcs: { type: Number, required: true, min: 0 },
    requiredQty: { type: Number, required: true, min: 0 },
    availableQty: { type: Number, default: 0 },
    unit: { type: String, default: 'Nos' },
  },
  { _id: false }
);

const bomProductionSchema = new Schema(
  {
    bom: { type: Schema.Types.ObjectId, ref: 'Bom', required: true, index: true },
    bomName: { type: String, default: '', trim: true },
    bomVersion: { type: String, default: '', trim: true },
    productionQty: { type: Number, required: true, min: 0.0001 },
    person: { type: String, required: true, trim: true, index: true },
    productionDate: { type: Date, required: true, default: Date.now },
    referenceNo: { type: String, default: '', trim: true },
    remarks: { type: String, default: '', trim: true },
    lines: { type: [productionLineSchema], default: [] },
    movements: [{ type: Schema.Types.ObjectId, ref: 'StockMovement' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bomProductionSchema.index({ createdAt: -1 });
bomProductionSchema.index({ bomName: 'text', person: 'text', referenceNo: 'text' });

module.exports = mongoose.model('BomProduction', bomProductionSchema);
