const mongoose = require('mongoose');
const { VISIT_EXPENSE_STATUS, VISIT_EXPENSE_CLAIM_MODE, TRANSPORT_MODE } = require('../config/constants');

const { Schema } = mongoose;

const expenseItemSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', required: true },
    transportMode: { type: String, enum: Object.values(TRANSPORT_MODE), default: TRANSPORT_MODE.PRIVATE },
    distanceKm: { type: Number, default: 0 },
    ratePerKm: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    fare: { type: Number, default: 0 },
    ticketUrl: { type: String, default: null },
    ticketPublicId: { type: String, default: null },
  },
  { _id: true }
);

const visitExpenseSchema = new Schema(
  {
    salesperson: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    dailyVisitDay: { type: Schema.Types.ObjectId, ref: 'DailyVisitDay', default: null },
    items: { type: [expenseItemSchema], default: [] },
    claimMode: {
      type: String,
      enum: Object.values(VISIT_EXPENSE_CLAIM_MODE),
      default: VISIT_EXPENSE_CLAIM_MODE.PER_VISIT,
    },
    dayTotalAmount: { type: Number, default: 0 },
    totalKm: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(VISIT_EXPENSE_STATUS),
      default: VISIT_EXPENSE_STATUS.DRAFT,
      index: true,
    },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminComment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

visitExpenseSchema.index({ salesperson: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('VisitExpense', visitExpenseSchema);
