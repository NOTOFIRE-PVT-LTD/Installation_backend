const mongoose = require('mongoose');
const { CLAIM_STATUS } = require('../config/constants');

const { Schema } = mongoose;

const mediaSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const dailyReportEntrySchema = new Schema(
  {
    photos: { type: [mediaSchema], default: [] },
    videos: { type: [mediaSchema], default: [] },
    comment: { type: String, default: '', trim: true },
    issue: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const itemQtySchema = new Schema(
  { item: { type: String, default: '', trim: true }, qty: { type: Number, default: 0 }, unit: { type: String, default: 'Nos', trim: true } },
  { _id: false }
);

const contactSchema = new Schema(
  { name: { type: String, default: '', trim: true }, number: { type: String, default: '', trim: true } },
  { _id: false }
);

const additionalOfficerSchema = new Schema(
  {
    designation: { type: String, default: '', trim: true },
    name: { type: String, default: '', trim: true },
    number: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const claimRequestSchema = new Schema(
  {
    date: { type: Date, default: null },
    amountRequested: { type: Number, default: 0, min: 0 },
    amountAfterTds: { type: Number, default: 0, min: 0 },
    amountCleared: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

const stationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: 'Station', trim: true },
    sse: { type: contactSchema, default: () => ({}) },
    installer: { type: contactSchema, default: () => ({}) },
    supervisor: { type: contactSchema, default: () => ({}) },
    materials: { type: [itemQtySchema], default: [] },
    startDate: { type: Date, default: null },
    completionDate: { type: Date, default: null },
    commissioningDate: { type: Date, default: null },
    reasonForDelay: { type: String, default: '', trim: true },
    checklistFile: { type: mediaSchema, default: null },
    checklistSignedFile: { type: mediaSchema, default: null },
    workPhotos: { type: [mediaSchema], default: [] },
    cadDrawingFile: { type: mediaSchema, default: null },
    installationAmount: { type: Number, default: 0, min: 0 },
    claimDate: { type: Date, default: null },
    amountClaimed: { type: Number, default: 0, min: 0 }, // Total amount requested (sum of claimRequests)
    amountAfterTds: { type: Number, default: 0, min: 0 },
    amountCleared: { type: Number, default: 0, min: 0 },
    claimRequests: { type: [claimRequestSchema], default: [] },
    claimStatus: { type: String, enum: Object.values(CLAIM_STATUS), default: CLAIM_STATUS.NOT_SUBMITTED },
    bonusEligible: { type: Boolean, default: false },
    bonusPercent: { type: Number, default: 0 },
    bonusAmount: { type: Number, default: 0 },
    remarks: { type: String, default: '', trim: true },
    completePhotos: { type: [mediaSchema], default: [] },
    remainingPhotos: { type: [mediaSchema], default: [] },
    dailyReports: { type: [dailyReportEntrySchema], default: [] },
  },
  { timestamps: true }
);

const projectSchema = new Schema(
  {
    projectName: { type: String, required: true, trim: true },
    installerName: { type: String, required: true, trim: true },
    assignedInstaller: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    contractor: { type: String, required: true, trim: true },
    invoiceNoDateSupply: { type: String, default: '', trim: true },
    installationInvoice: { type: String, default: '', trim: true },
    railwayZone: { type: String, required: true, trim: true },
    serialType: {
      type: String,
      enum: ['Panel Serial No.', 'LHS', 'AHD'],
      default: 'Panel Serial No.',
      trim: true,
    },
    panelSerialStart: { type: String, default: '', trim: true },
    panelSerialEnd: { type: String, default: '', trim: true },
    panelSerialNo: { type: String, required: true, unique: true, trim: true },
    cableUsed: { type: Number, min: 0, default: 0 },
    asdUsed: { type: Number, min: 0, default: 0 },
    lhdUsed: { type: Number, min: 0, default: 0 },
    noOfDevices: { type: Number, min: 0, default: 0 },
    installationStartDate: { type: Date, default: null },
    installationEndDate: { type: Date, default: null },
    dateOfCommissioning: { type: Date, default: null },
    checklistReceived: { type: Boolean, default: false },
    amountFixWithContractor: { type: Number, min: 0, default: 0 },
    amountFixWithInstaller: { type: Number, min: 0, default: 0 },
    amountReceivedFromContractor: { type: Number, min: 0, default: 0 },
    amountPaidToInstaller: { type: Number, min: 0, default: 0 },
    balancePayment: { type: Number, default: 0 },
    dateOfPayment: { type: Date, default: null },
    checklistPdf: { type: mediaSchema, default: null },
    commissioningVideos: { type: [mediaSchema], default: [] },
    installationInvoiceDoc: { type: mediaSchema, default: null },
    supplyInvoiceDoc: { type: mediaSchema, default: null },
    installationPoDoc: { type: mediaSchema, default: null },
    loaNo: { type: String, default: '', trim: true },
    loaDate: { type: Date, default: null },
    workName: { type: String, default: '', trim: true },
    dateOfCompletionLOA: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    reasonForDelay: { type: String, default: '', trim: true },
    supervisorName: { type: String, default: '', trim: true },
    totalUnits: {
      stations: { type: Number, default: 0 },
      ibh: { type: Number, default: 0 },
      autoHuts: { type: Number, default: 0 },
      lcGates: { type: Number, default: 0 },
      telecomExchanges: { type: Number, default: 0 },
      buildings: { type: Number, default: 0 },
      signal: { type: Number, default: 0 },
    },
    loaItems: { type: [itemQtySchema], default: [] },
    railwayOfficers: {
      srDste: { type: contactSchema, default: () => ({}) },
      dste: { type: contactSchema, default: () => ({}) },
      sse: { type: contactSchema, default: () => ({}) },
    },
    additionalOfficers: { type: [additionalOfficerSchema], default: [] },
    totalInstallationAmount: { type: Number, min: 0, default: 0 },
    notofireContact: {
      name: { type: String, default: '', trim: true },
      number: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true },
    },
    bonusPercentOverride: { type: Number, default: null },
    installerRatings: {
      timelyCompletion: { type: Number, min: 1, max: 5, default: null },
      qualityOfWork: { type: Number, min: 1, max: 5, default: null },
      complaintsOrIssues: { type: String, default: '', trim: true },
    },
    stations: { type: [stationSchema], default: [] },
    dailyReports: { type: [dailyReportEntrySchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

projectSchema.index({ projectName: 'text', installerName: 'text', contractor: 'text', panelSerialNo: 'text' });

module.exports = mongoose.model('Project', projectSchema);
