const mongoose = require('mongoose');
const { DAY_VISIT_STATUS } = require('../config/constants');

const { Schema } = mongoose;

const dailyVisitDaySchema = new Schema(
  {
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    visitIds: [{ type: Schema.Types.ObjectId, ref: 'Visit' }],
    status: {
      type: String,
      enum: Object.values(DAY_VISIT_STATUS),
      default: DAY_VISIT_STATUS.DRAFT,
      index: true,
    },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

dailyVisitDaySchema.index({ salesperson: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyVisitDay', dailyVisitDaySchema);
