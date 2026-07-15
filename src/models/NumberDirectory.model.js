const mongoose = require('mongoose');
const { NUMBER_CATEGORIES } = require('../config/constants');

const { Schema } = mongoose;

const numberDirectorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
    category: { type: String, enum: Object.values(NUMBER_CATEGORIES), required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

numberDirectorySchema.index({ number: 1, category: 1 }, { unique: true });
numberDirectorySchema.index({ name: 'text', region: 'text' });

module.exports = mongoose.model('NumberDirectory', numberDirectorySchema);
