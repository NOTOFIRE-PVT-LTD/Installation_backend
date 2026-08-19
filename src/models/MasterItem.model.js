const mongoose = require('mongoose');

const { Schema } = mongoose;

const catalogRef = () => ({ type: Schema.Types.ObjectId, ref: 'ItemMasterCatalog', default: null });

const masterItemSchema = new Schema(
  {
    endUse: { type: String, default: '', trim: true },
    personAsked: { type: String, default: '', trim: true },
    priceGuarantee: { type: String, default: '', trim: true },
    itemCategory: { type: Schema.Types.ObjectId, ref: 'ItemMasterCatalog', required: true },
    itemName: { type: String, required: true, trim: true },
    itemDescription: { type: String, default: '', trim: true },
    image: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    quantity: { type: Number, default: 0, min: 0 },
    qtyType: catalogRef(),
    price: { type: Number, default: 0, min: 0 },
    // Derived from quantity × price on every write so lists and exports can sort on it.
    totalAmount: { type: Number, default: 0, min: 0 },
    payment: catalogRef(),
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

masterItemSchema.index({ itemName: 1 });

module.exports = mongoose.model('MasterItem', masterItemSchema);
