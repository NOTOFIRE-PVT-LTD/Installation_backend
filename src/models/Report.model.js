const mongoose = require('mongoose');
const { REPORT_STATUS } = require('../config/constants');

const { Schema } = mongoose;

const mediaSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const reportSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    workDescription: { type: String, required: true },
    progressPercentage: { type: Number, required: true, min: 0, max: 100 },
    sitePhotos: {
      type: [mediaSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one site photo is required',
      },
      required: true,
    },
    siteVideo: { type: mediaSchema, default: null },
    materialUsed: { type: String, default: '' },
    remarks: { type: String, default: '' },
    status: { type: String, enum: Object.values(REPORT_STATUS), default: REPORT_STATUS.PENDING },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index({ project: 1, date: -1 });
reportSchema.index({ status: 1 });

module.exports = mongoose.model('Report', reportSchema);
