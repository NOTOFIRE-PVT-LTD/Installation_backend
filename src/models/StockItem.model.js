const mongoose = require('mongoose');
const { STOCK_ITEM_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const stockItemSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: 'StockCatalog', default: null },
    component: { type: Schema.Types.ObjectId, ref: 'StockCatalog', default: null },
    subComponent: { type: Schema.Types.ObjectId, ref: 'StockCatalog', default: null },
    categoryName: { type: String, default: '', trim: true },
    componentName: { type: String, default: '', trim: true },
    subComponentName: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: '', trim: true },
    unit: { type: String, default: 'Nos', trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
    totalPiecesSale: { type: Number, default: 0, min: 0 },
    itemType: { type: String, enum: STOCK_ITEM_TYPES, default: STOCK_ITEM_TYPES[0] },
    salesOrder: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    docs: { type: [fileSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

stockItemSchema.index({
  name: 'text',
  categoryName: 'text',
  componentName: 'text',
  subComponentName: 'text',
  salesOrder: 'text',
});
stockItemSchema.index({ name: 1 });
stockItemSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockItem', stockItemSchema);
