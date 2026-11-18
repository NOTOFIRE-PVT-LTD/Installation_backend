const mongoose = require('mongoose');
const { LEAVE_PAY, LEAVE_STATUS } = require('../config/constants');

const { Schema } = mongoose;

const leaveSchema = new Schema(
  {
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    reason: { type: String, required: true, trim: true },
    payType: { type: String, enum: Object.values(LEAVE_PAY), required: true },
    status: {
      type: String,
      enum: Object.values(LEAVE_STATUS),
      default: LEAVE_STATUS.PENDING,
      index: true,
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminComment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

leaveSchema.index({ salesperson: 1, requestedAt: -1 });

module.exports = mongoose.model('Leave', leaveSchema);
