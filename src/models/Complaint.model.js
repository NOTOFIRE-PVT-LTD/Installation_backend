const mongoose = require('mongoose');

const { Schema } = mongoose;

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null },
  },
  { _id: false }
);

const workLogSchema = new Schema(
  {
    engineer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    engineerName: { type: String, trim: true, default: '' },
    workDate: { type: Date, default: Date.now },
    workPerformed: { type: String, required: true, trim: true },
    findings: { type: String, trim: true, default: '' },
    actionTaken: { type: String, trim: true, default: '' },
    partsUsed: { type: String, trim: true, default: '' },
    testPerformed: { type: String, trim: true, default: '' },
    testResult: { type: String, trim: true, default: '' },
    nextAction: { type: String, trim: true, default: '' },
    followUpDate: { type: Date, default: null },
    remarks: { type: String, trim: true, default: '' },
    loggedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const assignmentHistorySchema = new Schema(
  {
    fromEngineer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fromEngineerName: { type: String, trim: true, default: 'Unassigned' },
    toEngineer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toEngineerName: { type: String, trim: true, default: '' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedByName: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const statusHistorySchema = new Schema(
  {
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedByName: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, trim: true, default: 'System' },
    action: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    oldValue: { type: String, trim: true, default: '' },
    newValue: { type: String, trim: true, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, trim: true, default: 'Staff' },
    authorRole: { type: String, trim: true, default: '' },
    content: { type: String, required: true, trim: true },
    visibility: {
      type: String,
      enum: ['INTERNAL', 'CUSTOMER_VISIBLE'],
      default: 'INTERNAL',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const emailLogSchema = new Schema(
  {
    recipient: { type: String, trim: true },
    subject: { type: String, trim: true },
    emailType: { type: String, default: 'RESOLUTION_NOTIFICATION' },
    status: { type: String, default: 'SENT' },
    errorMessage: { type: String, default: null },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const complaintSchema = new Schema(
  {
    ticketNo: { type: String, required: true, unique: true, trim: true, index: true },
    source: {
      type: String,
      enum: ['SELF_SERVICE', 'PHONE', 'INTERNAL', 'WHATSAPP', 'QR', 'Admin'],
      default: 'PHONE',
    },

    // Customer details
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    companyName: { type: String, trim: true, default: '' },
    customerOrganization: { type: String, trim: true, default: '' },
    customerLocation: { type: String, trim: true, default: '' },
    siteName: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },

    // Equipment / Product details
    productId: { type: Schema.Types.ObjectId, ref: 'MasterItem', default: null },
    product: { type: String, trim: true, default: '' },
    productName: { type: String, trim: true, default: '' },
    productModel: { type: String, trim: true, default: '' },
    productSerialNumber: { type: String, trim: true, default: '', index: true },
    dispatchDate: { type: Date, default: null },
    installationDate: { type: Date, default: null },
    warrantyMonths: { type: Number, default: 24 },
    warrantyEndDate: { type: Date, default: null },
    warrantyStatus: {
      type: String,
      enum: ['IN_WARRANTY', 'WARRANTY_EXPIRING', 'WARRANTY_EXPIRED', 'NOT_APPLICABLE', 'UNKNOWN'],
      default: 'UNKNOWN',
    },

    // Complaint details
    category: { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'Low', 'Medium', 'High', 'Critical'],
      default: 'MEDIUM',
    },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    customerReportedIssue: { type: String, trim: true, default: '' },
    dateIssueStarted: { type: Date, default: Date.now },
    photos: { type: [photoSchema], default: [] },

    // Lifecycle Status
    status: {
      type: String,
      enum: [
        'NEW',
        'ACKNOWLEDGED',
        'ASSIGNED',
        'IN_PROGRESS',
        'PENDING',
        'WAITING_FOR_CUSTOMER',
        'WAITING_FOR_PART',
        'RESOLUTION_SUBMITTED',
        'RESOLVED',
        'CLOSED',
        'REOPENED',
        // Legacy aliases
        'Open',
        'In Progress',
        'Resolved',
        'Closed',
      ],
      default: 'NEW',
      index: true,
    },
    isAcknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date, default: null },
    pendingRemark: { type: String, default: '' },
    pendingRemarkAt: { type: Date, default: null },
    pendingRemarkBy: { type: String, default: '' },

    // Sheet-style intake fields (admin / salesperson create for customer)
    complaintReceiverName: { type: String, trim: true, default: '' },
    solutions: { type: String, trim: true, default: '' },
    takenTime: { type: String, trim: true, default: '' },
    attempt: { type: Number, default: 1, min: 1 },
    deliveryStatus: { type: String, trim: true, default: '' },
    notifyChannel: {
      type: String,
      enum: ['whatsapp', 'sms', 'both'],
      default: 'whatsapp',
    },

    // Staff assignments
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedAt: { type: Date, default: null },
    complaintHandlerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // SLAs & Follow-ups
    dueAt: { type: Date, default: null, index: true },
    followUpDate: { type: Date, default: null, index: true },
    targetDate: { type: Date, default: null },

    // Resolution details
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionReason: { type: String, trim: true, default: '' },
    resolutionActionTaken: { type: String, trim: true, default: '' },
    resolutionSummary: { type: String, trim: true, default: '' },
    resolutionRemarks: { type: String, trim: true, default: '' },
    resolutionPartsUsed: { type: String, trim: true, default: '' },
    resolutionNotes: { type: String, trim: true, default: '' },

    // Reopen details
    reopenedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedAt: { type: Date, default: null },
    reopenReason: { type: String, trim: true, default: '' },

    // Close details
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },

    // Embedded historical logs & communications
    workLogs: { type: [workLogSchema], default: [] },
    assignmentHistory: { type: [assignmentHistorySchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    activityLogs: { type: [activityLogSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    emailLogs: { type: [emailLogSchema], default: [] },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ contactNumber: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
