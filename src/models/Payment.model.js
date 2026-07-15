const mongoose = require('mongoose');
const { PAYMENT_STATUS, PAYMENT_METHOD } = require('../config/constants');

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    method: { type: String, enum: Object.values(PAYMENT_METHOD), required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    remarks: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
