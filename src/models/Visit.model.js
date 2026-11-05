const mongoose = require('mongoose');
const { VISIT_STATUS, VISIT_TYPE } = require('../config/constants');

const { Schema } = mongoose;

const visitSchema = new Schema(
  {
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    visitType: { type: String, enum: Object.values(VISIT_TYPE), default: VISIT_TYPE.HOURLY, index: true },
    visitDate: { type: String, required: true, index: true },
    visitDateTo: { type: String, default: null, index: true },
    plannedTime: { type: String, required: true, trim: true },
    endTime: { type: String, default: '', trim: true },
    purpose: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    locationLat: { type: Number, default: null },
    locationLng: { type: Number, default: null },
    locationAddress: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: Object.values(VISIT_STATUS),
      default: VISIT_STATUS.PLANNED,
      index: true,
    },
    checkInAt: { type: Date, default: null },
    checkInLat: { type: Number, default: null },
    checkInLng: { type: Number, default: null },
    checkInDistanceM: { type: Number, default: null },
    checkInPhotoUrl: { type: String, default: null },
    checkInPhotoPublicId: { type: String, default: null },
    checkInAddress: { type: String, default: '', trim: true },
    checkOutAt: { type: Date, default: null },
    checkOutLat: { type: Number, default: null },
    checkOutLng: { type: Number, default: null },
    checkOutDistanceM: { type: Number, default: null },
    checkOutPhotoUrl: { type: String, default: null },
    checkOutPhotoPublicId: { type: String, default: null },
    checkOutAddress: { type: String, default: '', trim: true },
    visitDurationMin: { type: Number, default: null },
    travelKm: { type: Number, default: null },
    outcomeNotes: { type: String, default: '', trim: true },
    missedReason: { type: String, default: null },
    missedExplanation: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

visitSchema.index({ salesperson: 1, visitDate: 1, plannedTime: 1 });

module.exports = mongoose.model('Visit', visitSchema);
