const mongoose = require('mongoose');
const { INSPECTION_STATUS, LOA_TYPES } = require('../config/constants');

const { Schema } = mongoose;

const INSPECTION_CHARGE_BORN_BY = Object.freeze({
  RAILWAY: 'Railway',
  CONTRACTOR: 'Contractor',
});

const fileSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const checklistItemSchema = new Schema(
  {
    itemName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(INSPECTION_STATUS),
      default: INSPECTION_STATUS.PENDING,
    },
    remark: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const loaItemSchema = new Schema(
  {
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    loaType: {
      type: String,
      enum: Object.values(LOA_TYPES),
      required: true,
      default: LOA_TYPES.NOTOFIRE,
    },
  },
  { _id: true }
);

const inspectionSchema = new Schema(
  {
    tender: { type: Schema.Types.ObjectId, ref: 'NitTender', required: true, index: true },

    // Snapshot LOA info for stable display even if Tender changes later.
    loaNumber: { type: String, default: '', trim: true },
    loaValue: { type: Number, default: 0, min: 0 },
    loaWorkCompletion: { type: Date, default: null },
    loaDivisionName: { type: String, default: '', trim: true },
    contractorName: { type: String, default: '', trim: true },
    loaItems: { type: [loaItemSchema], default: [] },

    inspectionDate: { type: Date, required: true },
    firmCallNo: { type: String, required: true, trim: true },
    rdsoCallNo: { type: String, required: true, trim: true },
    inspectorName: { type: String, required: true, trim: true },
    fireAlarmQty: { type: Number, required: true, min: 0, default: 0 },
    controlPanelQty: { type: Number, required: true, min: 0, default: 0 },
    dmNo: { type: String, required: true, trim: true },
    doc: { type: String, required: true, trim: true },
    consignee: { type: String, required: true, trim: true },
    orderingAuthority: { type: String, required: true, trim: true },

    inspectionChargeBornBy: {
      type: String,
      enum: Object.values(INSPECTION_CHARGE_BORN_BY),
      required: true,
      default: INSPECTION_CHARGE_BORN_BY.RAILWAY,
    },
    mersNo: { type: String, default: '', trim: true },

    status: {
      type: String,
      enum: Object.values(INSPECTION_STATUS),
      default: INSPECTION_STATUS.PENDING,
      index: true,
    },
    checklistItems: { type: [checklistItemSchema], default: [] },
    remarks: { type: String, default: '', trim: true },

    dmFile: { type: fileSchema, default: null },
    icCopy: { type: fileSchema, default: null },
    firmCallLetter: { type: fileSchema, default: null },
    otherDetailsFiles: { type: [fileSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

inspectionSchema.index({ tender: 1, createdAt: -1 });
inspectionSchema.index({ inspectorName: 'text', loaNumber: 'text', contractorName: 'text', remarks: 'text' });

module.exports = mongoose.model('Inspection', inspectionSchema);
