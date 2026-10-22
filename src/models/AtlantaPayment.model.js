const mongoose = require('mongoose');

const { Schema } = mongoose;

const money = { type: Number, default: 0, min: 0 };

const proofSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: '', trim: true },
    type: { type: String, default: '', trim: true },
    size: { type: Number, default: 0 },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: '' },
  },
  { _id: true }
);

const invoiceEntrySchema = new Schema(
  {
    invoiceNoDate: { type: String, default: '', trim: true },
    basicAmount: money,
    quantity: money,
    totalAmount: money,
    sseAmount: money,
    sseBabu: money,
    meggeringCharge: money,
    adste: money,
    budgetAccounts: money,
    dyCsteOs: money,
    dyCste: money,
    miscellaneous: money,
    miscRecipientName: { type: String, default: '', trim: true },
    totalExpense: money,
  },
  { _id: false }
);

const travelExpenseSchema = new Schema(
  {
    date: { type: Date, default: null },
    detail: { type: String, default: '', trim: true },
    amount: money,
    proof: { type: proofSchema, default: null },
    transactionDone: { type: Boolean, default: false },
  },
  { _id: true }
);

const paymentReceivedSchema = new Schema(
  {
    paymentDate: { type: Date, default: null },
    amount: money,
    deductAmount: money,
    details: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const atlantaPaymentSchema = new Schema(
  {
    legacySupabaseId: { type: String, default: null, trim: true },
    fileName: { type: String, required: true, trim: true },
    consigneeName: { type: String, default: '', trim: true },
    crnDate: { type: Date, default: null },
    paymentDate: { type: Date, default: null },
    employeeId: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },

    paymentDetails: { type: String, default: '' },
    paymentReceivedDate: { type: String, default: '' },

    workMaterialItems: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    sourceData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, default: '', trim: true },
    travelStartAt: { type: Date, default: null },
    reachedAt: { type: Date, default: null },
    exitAt: { type: Date, default: null },
    travelDays: { type: Number, default: 0, min: 0 },
    ratePerDay: money,
    totalTada: money,
    invoiceEntries: { type: [invoiceEntrySchema], default: [] },
    totalBasicAmount: money,
    totalInvoiceAmount: money,
    totalExpense: money,
    travelExpenses: { type: [travelExpenseSchema], default: [] },
    totalTravelExpenses: money,
    paymentsReceived: { type: [paymentReceivedSchema], default: [] },
    totalReceivedAmount: money,
    // Total TADA + invoice expenses + travel expenses - total received (can go negative = overpaid).
    amountToGive: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

atlantaPaymentSchema.index({ createdAt: -1 });
atlantaPaymentSchema.index({ fileName: 1 });
atlantaPaymentSchema.index(
  { legacySupabaseId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('AtlantaPayment', atlantaPaymentSchema);
