const mongoose = require('mongoose');

const { Schema } = mongoose;

const complaintCounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplaintCounter', complaintCounterSchema);
