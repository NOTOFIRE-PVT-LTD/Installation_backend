const mongoose = require('mongoose');

const { Schema } = mongoose;

const subRowSchema = new Schema(
  {
    nomenclature: { type: String, default: '', trim: true },
    modelNo: { type: String, default: '', trim: true },
    serialNo: { type: String, default: '', trim: true },
    hologram: { type: String, default: '', trim: true },
    qtyOnOrder: { type: String, default: '', trim: true },
    qtyOffered: { type: String, default: '', trim: true },
    qtyAccepted: { type: String, default: '', trim: true },
    qtyValue: { type: Number, default: 0 },
    unit: { type: String, default: 'Nos', trim: true },
  },
  { _id: false }
);

const proformaRowSchema = new Schema(
  {
    itemNoOfSchB: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    qty: { type: String, default: '', trim: true },
    qtyValue: { type: Number, default: 0 },
    unit: { type: String, default: 'Nos', trim: true },
    depttSchRate: { type: Number, default: 0 },
    depttSchRateRaw: { type: String, default: '', trim: true },
    acceptedRate: { type: String, default: 'At Par', trim: true },
    firmName: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const callLetterItemSchema = new Schema(
  {
    itemNoOfSchB: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    nomenclature: { type: String, default: '', trim: true },
    modelNo: { type: String, default: '', trim: true },
    serialNo: { type: String, default: '', trim: true },
    hologram: { type: String, default: '', trim: true },
    qty: { type: String, default: '', trim: true },
    qtyValue: { type: Number, default: 0 },
    qtyPerSet: { type: Number, default: 0 },
    scheduleMultiplier: { type: Number, default: 1 },
    unit: { type: String, default: '', trim: true },
    qtyOnOrder: { type: String, default: '', trim: true },
    qtyOffered: { type: String, default: '', trim: true },
    qtyAccepted: { type: String, default: '', trim: true },
    depttSchRate: { type: Number, default: 0 },
    depttSchRateRaw: { type: String, default: '', trim: true },
    acceptedRate: { type: String, default: 'At Par', trim: true },
    firmName: { type: String, default: '', trim: true },
    subRows: { type: [subRowSchema], default: [] },
  },
  { _id: false }
);

const callLetterSpareSchema = new Schema(
  {
    clause: { type: String, default: '4.15.1', trim: true },
    nomenclature: { type: String, default: '', trim: true },
    modelNo: { type: String, default: '', trim: true },
    serialNo: { type: String, default: '', trim: true },
    hologram: { type: String, default: '', trim: true },
    qty: { type: String, default: '01 Nos', trim: true },
    qtyValue: { type: Number, default: 1 },
    unit: { type: String, default: 'Nos', trim: true },
  },
  { _id: false }
);

const callLetterSchema = new Schema(
  {
    tender: { type: Schema.Types.ObjectId, ref: 'NitTender', default: null, index: true },
    contractAgreement: { type: Schema.Types.ObjectId, ref: 'ContractAgreement', default: null },

    // Snapshot for stable display.
    tenderName: { type: String, default: '', trim: true },
    zone: { type: String, default: '', trim: true },
    callLetter: { type: String, default: '', trim: true },

    // RDSO Proforma / Call Letter Extracted Header Fields
    nameOfWork: { type: String, default: '', trim: true },
    loaNoAndDate: { type: String, default: '', trim: true },
    orderingAuthority: { type: String, default: '', trim: true },
    contractorName: { type: String, default: '', trim: true },
    contractorShortName: { type: String, default: '', trim: true },
    consignee: { type: String, default: '', trim: true },
    inspectionChargesBy: { type: String, default: 'Contractor', trim: true },
    inspectionAuthority: { type: String, default: 'RDSO, Lucknow', trim: true },
    contractValidity: { type: String, default: '', trim: true },
    forwardedLetterNo: { type: String, default: '', trim: true },
    letterDate: { type: String, default: '', trim: true },
    firmNameAndPlace: { type: String, default: '', trim: true },
    specificationNo: { type: String, default: 'RDSO/SPN/217/2025 Version - 3.1 Or Latest', trim: true },

    // Inspection Top Sheet & Guarantee Certificate Fields
    callLetterNoAndDate: { type: String, default: '', trim: true },
    dateOfInspection: { type: String, default: '', trim: true },
    inspectingOfficial: { type: String, default: '', trim: true },
    guaranteeCertificateNo: { type: String, default: '', trim: true },
    guaranteeIssueDate: { type: String, default: '', trim: true },
    sbCollectRefNo: { type: String, default: '', trim: true },
    sbCollectDate: { type: String, default: '', trim: true },
    payerGstin: { type: String, default: '09AAGCN7119L1Z0', trim: true },
    totalMaterialCost: { type: Number, default: 0 },

    proformaRows: { type: [proformaRowSchema], default: [] },
    items: { type: [callLetterItemSchema], default: [] },
    spares: { type: [callLetterSpareSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

callLetterSchema.index({ callLetter: 'text', tenderName: 'text', zone: 'text', loaNoAndDate: 'text', contractorName: 'text' });
callLetterSchema.index({ createdAt: -1 });
callLetterSchema.index({ tender: 1, createdAt: -1 });

module.exports = mongoose.model('CallLetter', callLetterSchema);
