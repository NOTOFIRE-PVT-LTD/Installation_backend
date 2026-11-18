const mongoose = require('mongoose');

const { Schema } = mongoose;

const contractorAttendanceSchema = new Schema(
  {
    batchId: { type: String, required: true, index: true },
    fileName: { type: String, default: '', trim: true },
    monthYear: { type: String, default: '', trim: true, index: true },
    contractorName: { type: String, required: true, trim: true, index: true },
    workerName: { type: String, required: true, trim: true, index: true },
    workerId: { type: String, default: '', trim: true, index: true },
    category: { type: String, default: 'General', trim: true }, // Skilled, Semi-Skilled, Unskilled, Supervisor, etc.
    siteLocation: { type: String, default: '', trim: true },
    presentDays: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    dailyRate: { type: Number, default: 0, min: 0 },
    wages: { type: Number, required: true, default: 0, min: 0 }, // Total Wages column
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Approved', 'Paid'],
      default: 'Pending',
      index: true,
    },
    remarks: { type: String, default: '', trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

contractorAttendanceSchema.index({ contractorName: 'text', workerName: 'text', workerId: 'text', siteLocation: 'text' });

module.exports = mongoose.model('ContractorAttendance', contractorAttendanceSchema);

