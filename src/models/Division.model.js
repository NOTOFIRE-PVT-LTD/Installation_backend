const mongoose = require('mongoose');

const { Schema } = mongoose;

const divisionSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    zone: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

divisionSchema.index({ zone: 1 });

module.exports = mongoose.model('Division', divisionSchema);
