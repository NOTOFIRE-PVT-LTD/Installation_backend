const mongoose = require('mongoose');
const { ITEM_MASTER_CATALOG_FIELDS } = require('../config/constants');

const { Schema } = mongoose;

const itemMasterCatalogSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ITEM_MASTER_CATALOG_FIELDS,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

itemMasterCatalogSchema.index({ kind: 1, name: 1 });

module.exports = mongoose.model('ItemMasterCatalog', itemMasterCatalogSchema);
