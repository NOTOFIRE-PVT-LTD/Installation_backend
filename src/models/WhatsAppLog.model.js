const mongoose = require('mongoose');

const { Schema } = mongoose;

const whatsAppLogSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mobileNumber: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
    message: { type: String, default: '' },
    error: { type: String, default: '' },
    providerResponse: { type: Schema.Types.Mixed, default: null },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    stationId: { type: Schema.Types.ObjectId, default: null },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

whatsAppLogSchema.index({ createdAt: -1 });
whatsAppLogSchema.index({ eventType: 1, status: 1 });

module.exports = mongoose.model('WhatsAppLog', whatsAppLogSchema);
