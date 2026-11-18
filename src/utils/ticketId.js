const ComplaintCounter = require('../models/ComplaintCounter.model');
const mongoose = require('mongoose');

/**
 * Generates unique human-readable Ticket ID in the format: CMP-YYYY-XXXXXX
 * Example: CMP-2026-000001, CMP-2026-000124
 */
async function generateTicketId() {
  const currentYear = new Date().getFullYear();
  const counterId = `CMP-${currentYear}`;

  let nextSeq = 1;
  try {
    const counter = await ComplaintCounter.findByIdAndUpdate(
      counterId,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    nextSeq = counter.seq;
  } catch (err) {
    // Fallback: check highest ticketNo from database
    const Complaint = mongoose.model('Complaint');
    const latest = await Complaint.findOne({
      ticketNo: new RegExp(`^CMP-${currentYear}-`),
    }).sort({ ticketNo: -1 });

    if (latest && latest.ticketNo) {
      const parts = latest.ticketNo.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
    }
  }

  const paddedSeq = String(nextSeq).padStart(6, '0');
  return `CMP-${currentYear}-${paddedSeq}`;
}

module.exports = {
  generateTicketId,
};

