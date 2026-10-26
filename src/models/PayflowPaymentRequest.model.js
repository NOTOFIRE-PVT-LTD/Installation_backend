const mongoose = require('mongoose');

const { Schema } = mongoose;

const PAYMENT_REQUEST_STATUSES = ['Pending', 'Approved', 'Processed', 'Rejected', 'Query', 'Postponed'];
const PAYMENT_PRIORITIES = ['High', 'Medium', 'Low'];

const historySchema = new Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    remark: { type: String, default: '', trim: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentRequestSchema = new Schema(
  {
    srNo: { type: Number, required: true, unique: true },
    requestDate: { type: Date, default: Date.now },
    company: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    vendor: { type: String, required: true, trim: true, uppercase: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, default: '', trim: true },
    itemType: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    billNumber: { type: String, default: '', trim: true },
    billDate: { type: Date, default: null },
    totalOutstanding: { type: Number, default: 0, min: 0 },
    payAgainst: { type: String, default: '', trim: true },
    bankName: { type: String, default: '', trim: true },
    paymentMode: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
    priority: { type: String, enum: PAYMENT_PRIORITIES, default: 'Medium' },
    status: { type: String, enum: PAYMENT_REQUEST_STATUSES, default: 'Pending', index: true },
    priceCheckBy: {
      name: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    history: { type: [historySchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

paymentRequestSchema.index({ vendor: 1 });
paymentRequestSchema.index({ requestDate: -1 });

const PayflowPaymentRequest = mongoose.model('PayflowPaymentRequest', paymentRequestSchema);

// Each top-up of the payment fund is stored as an entry; the total fund is their sum.
const PayflowFund = mongoose.model(
  'PayflowFund',
  new Schema(
    {
      amount: { type: Number, required: true, min: 0 },
      note: { type: String, default: '', trim: true },
      addedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
  )
);

module.exports = { PayflowPaymentRequest, PayflowFund, PAYMENT_REQUEST_STATUSES, PAYMENT_PRIORITIES };
