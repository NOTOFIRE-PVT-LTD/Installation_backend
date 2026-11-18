const mongoose = require('mongoose');

const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    companyName: { type: String, required: true, trim: true },
    normalizedCompanyName: { type: String, required: true, trim: true, index: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    phoneNormalized: { type: String, default: '', trim: true, index: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    gstinNormalized: { type: String, default: '', trim: true, index: true },
    assignedSalesperson: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    locationLat: { type: Number, default: null },
    locationLng: { type: Number, default: null },
    active: { type: Boolean, default: true, index: true },
    overrideReason: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

customerSchema.index({ companyName: 'text', contactPerson: 'text', city: 'text', gstin: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
