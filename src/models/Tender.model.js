const mongoose = require('mongoose');

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    originalName: { type: String, default: '' },
  },
  { _id: false }
);

const tenderSchema = new Schema(
  {
    division: { type: Schema.Types.ObjectId, ref: 'Division', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    tenderName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    files: { type: [fileSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

tenderSchema.index({ division: 1, createdAt: -1 });
tenderSchema.index({ tenderName: 'text' });

module.exports = mongoose.model('Tender', tenderSchema);
