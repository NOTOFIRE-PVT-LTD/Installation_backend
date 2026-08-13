const mongoose = require('mongoose');
const { STOCK_CATALOG_KINDS } = require('../config/constants');

const { Schema } = mongoose;

const stockCatalogSchema = new Schema(
  {
    kind: {
      type: String,
      enum: Object.values(STOCK_CATALOG_KINDS),
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'StockCatalog', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

stockCatalogSchema.index({ kind: 1, parent: 1, name: 1 });

module.exports = mongoose.model('StockCatalog', stockCatalogSchema);
