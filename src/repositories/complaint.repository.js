const BaseRepository = require('./base.repository');
const Complaint = require('../models/Complaint.model');
const ComplaintCounter = require('../models/ComplaintCounter.model');

class ComplaintRepository extends BaseRepository {
  constructor() {
    super(Complaint);
  }

  async nextTicketNo() {
    const currentYear = new Date().getFullYear();
    const key = `CMP-${currentYear}`;
    const counter = await ComplaintCounter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return `CMP-${currentYear}-${String(counter.seq).padStart(6, '0')}`;
  }

  async findByTicketOrId(identifier) {
    const query = identifier.match(/^[0-9a-fA-F]{24}$/)
      ? { $or: [{ _id: identifier }, { ticketNo: identifier.toUpperCase() }] }
      : { ticketNo: identifier.toUpperCase() };

    return this.model
      .findOne(query)
      .populate('assignedTo', 'name email phone department')
      .populate('complaintHandlerId', 'name email phone')
      .populate('resolvedBy', 'name email')
      .populate('reopenedBy', 'name email')
      .populate('closedBy', 'name email')
      .populate('customerId')
      .populate('workLogs.engineer', 'name email')
      .populate('assignmentHistory.fromEngineer', 'name email')
      .populate('assignmentHistory.toEngineer', 'name email')
      .populate('assignmentHistory.assignedBy', 'name email')
      .populate('statusHistory.changedBy', 'name email')
      .populate('activityLogs.actor', 'name email')
      .populate('comments.author', 'name role');
  }
}

module.exports = new ComplaintRepository();
