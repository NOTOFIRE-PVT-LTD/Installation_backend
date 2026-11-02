const mongoose = require('mongoose');

const { Schema } = mongoose;

const money = { type: Number, default: 0, min: 0 };

const SALES_TRAVEL_STATUSES = Object.freeze(['Pending', 'Approved', 'Rejected']);

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

const personToMeetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    designation: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    contactNumber: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    nextAction: { type: String, default: '', trim: true },
    purposeOfMeeting: { type: String, default: '', trim: true },
    notesAboutPerson: { type: String, default: '', trim: true },
    meetingOutcome: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const itineraryRowSchema = new Schema(
  {
    date: { type: Date, default: null },
    from: { type: String, default: '', trim: true },
    to: { type: String, default: '', trim: true },
    modeOfTravel: { type: String, default: '', trim: true },
    availability: { type: String, default: '', trim: true },
    cost: money,
    trainOrFlightDetails: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const tripExpenseRowSchema = new Schema(
  {
    date: { type: Date, default: null },
    amount: money,
    expenseDetail: { type: String, default: '', trim: true },
    proof: { type: proofSchema, default: null },
  },
  { _id: true }
);

const salesTravelRequestSchema = new Schema(
  {
    travelFrom: { type: Date, default: null },
    travelTo: { type: Date, default: null },
    cityTravellingTo: { type: String, required: true, trim: true },
    travellerName: { type: String, required: true, trim: true },
    agenda: { type: String, default: '', trim: true },

    personsToMeet: { type: [personToMeetSchema], default: [] },
    travelItinerary: { type: [itineraryRowSchema], default: [] },
    travelCostSubtotal: money,

    tripExpenses: { type: [tripExpenseRowSchema], default: [] },
    dayWiseTotal: money,
    grandTotal: money,

    expectedRoi: { type: String, default: '', trim: true },

    status: {
      type: String,
      enum: SALES_TRAVEL_STATUSES,
      default: 'Pending',
    },
    adminRemark: { type: String, default: '', trim: true },
    adminRating: { type: Number, default: null, min: 1, max: 5 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

salesTravelRequestSchema.index({ createdAt: -1 });
salesTravelRequestSchema.index({ createdBy: 1, createdAt: -1 });
salesTravelRequestSchema.index({ status: 1, createdAt: -1 });

const SalesTravelRequest = mongoose.model('SalesTravelRequest', salesTravelRequestSchema);
SalesTravelRequest.SALES_TRAVEL_STATUSES = SALES_TRAVEL_STATUSES;

module.exports = SalesTravelRequest;

