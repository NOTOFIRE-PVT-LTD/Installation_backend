const mongoose = require('mongoose');
const { ATTENDANCE_CORRECTION_STATUS, ATTENDANCE_CORRECTION_KIND } = require('../config/constants');

const { Schema } = mongoose;

const attendanceCorrectionSchema = new Schema(
  {
    attendance: { type: Schema.Types.ObjectId, ref: 'Attendance', default: null, index: true },
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attendanceDate: { type: String, required: true, index: true },
    kind: { type: String, enum: Object.values(ATTENDANCE_CORRECTION_KIND), required: true },
    requestedPunchIn: { type: Date, default: null },
    requestedPunchOut: { type: Date, default: null },
    originalPunchIn: { type: Date, default: null },
    originalPunchOut: { type: Date, default: null },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_CORRECTION_STATUS),
      default: ATTENDANCE_CORRECTION_STATUS.PENDING,
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminComment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

attendanceCorrectionSchema.index({ salesperson: 1, attendanceDate: 1, status: 1 });
attendanceCorrectionSchema.index(
  { salesperson: 1, attendanceDate: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('AttendanceCorrection', attendanceCorrectionSchema);
