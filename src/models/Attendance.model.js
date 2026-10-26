const mongoose = require('mongoose');

const { Schema } = mongoose;

const ATTENDANCE_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

const attendanceSchema = new Schema(
  {
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attendanceDate: { type: String, required: true, index: true },
    punchInAt: { type: Date, default: null },
    punchOutAt: { type: Date, default: null },
    punchInLat: { type: Number, default: null },
    punchInLng: { type: Number, default: null },
    punchInAccuracy: { type: Number, default: null },
    punchInAddress: { type: String, default: null },
    punchInPhotoUrl: { type: String, default: null },
    punchInPhotoPublicId: { type: String, default: null },
    punchOutLat: { type: Number, default: null },
    punchOutLng: { type: Number, default: null },
    punchOutAccuracy: { type: Number, default: null },
    punchOutAddress: { type: String, default: null },
    punchOutPhotoUrl: { type: String, default: null },
    punchOutPhotoPublicId: { type: String, default: null },
    durationMin: { type: Number, default: null },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.OPEN,
      index: true,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ salesperson: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
module.exports.ATTENDANCE_STATUS = ATTENDANCE_STATUS;
