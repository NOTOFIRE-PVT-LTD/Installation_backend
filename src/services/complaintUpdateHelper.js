const complaintRepository = require('../repositories/complaint.repository');
const ApiError = require('../utils/ApiError');
const User = require('../models/User.model');
const { calculateWarrantyStatus } = require('../utils/warranty');
const {
  isAssignableEngineer,
  canTransitionStatus,
  dueAtFor,
} = require('./complaintHelpers');

function applyScalarFields(complaint, data, changes) {
  const fields = ['subject', 'description', 'category', 'customerReportedIssue', 'location', 'siteName', 'contactNumber', 'whatsappNumber', 'email', 'companyName', 'customerOrganization', 'followUpDate', 'targetDate'];
  for (const f of fields) {
    if (data[f] !== undefined && data[f] !== complaint[f]) {
      changes.push(`${f}: "${complaint[f]}" -> "${data[f]}"`);
      complaint[f] = data[f];
    }
  }
}

async function applyAssignedUpdate(complaint, data, currentUser, changes, now) {
  if (data.assignedTo === undefined || String(data.assignedTo) === String(complaint.assignedTo)) return;
  if (data.assignedTo) {
    const engUser = await User.findById(data.assignedTo);
    if (!engUser || !isAssignableEngineer(engUser)) {
      throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
    }
  }
  const prevAssigned = complaint.assignedTo;
  complaint.assignedTo = data.assignedTo || null;
  complaint.assignedAt = data.assignedTo ? now : null;
  complaint.assignmentHistory.push({
    fromEngineer: prevAssigned,
    fromEngineerName: 'Previous',
    toEngineer: data.assignedTo || null,
    toEngineerName: data.assignedTo ? 'Engineer' : 'Unassigned',
    assignedBy: currentUser ? currentUser._id : null,
    assignedByName: currentUser ? currentUser.name : 'Staff',
    reason: data.note || 'Assignment updated',
    timestamp: now,
  });
  changes.push(`AssignedTo changed`);
}

async function applyStatusUpdate(complaint, data, currentUser, changes, now) {
  if (data.status === undefined || data.status === complaint.status) return;
  const check = canTransitionStatus(complaint.status, data.status, currentUser?.role, currentUser?.adminType);
  if (!check.allowed) throw new ApiError(400, check.reason);

  const prevStatus = complaint.status;
  complaint.status = data.status;
  changes.push(`Status: ${prevStatus} -> ${data.status}`);

  if (data.status === 'PENDING') {
    complaint.pendingRemark = data.pendingRemark || '';
    complaint.pendingRemarkAt = now;
    complaint.pendingRemarkBy = currentUser?.name || '';
  }

  complaint.statusHistory.push({
    fromStatus: prevStatus,
    toStatus: data.status,
    changedBy: currentUser ? currentUser._id : null,
    changedByName: currentUser ? currentUser.name : 'Staff',
    reason: data.pendingRemark || data.note || `Status updated to ${data.status}`,
    timestamp: now,
  });
}

function applySerialAndPriority(complaint, data, changes, now) {
  if (data.productSerialNumber !== undefined && data.productSerialNumber !== complaint.productSerialNumber) {
    changes.push(`Serial No: "${complaint.productSerialNumber || 'None'}" -> "${data.productSerialNumber}"`);
    complaint.productSerialNumber = data.productSerialNumber;
    const calc = calculateWarrantyStatus(complaint.dispatchDate, complaint.warrantyEndDate, complaint.warrantyMonths || 24);
    complaint.warrantyStatus = calc.status;
    changes.push(`Warranty Status: ${calc.status}`);
  }
  if (data.priority !== undefined && data.priority !== complaint.priority) {
    changes.push(`Priority: "${complaint.priority}" -> "${data.priority}"`);
    complaint.priority = String(data.priority).toUpperCase();
    complaint.dueAt = dueAtFor(complaint.priority, complaint.createdAt || now);
  }
}

async function update(id, data, currentUser) {
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const now = new Date();
  const changes = [];
  applyScalarFields(complaint, data, changes);
  applySerialAndPriority(complaint, data, changes, now);
  await applyAssignedUpdate(complaint, data, currentUser, changes, now);
  await applyStatusUpdate(complaint, data, currentUser, changes, now);

  if (data.resolutionNotes !== undefined && data.resolutionNotes !== complaint.resolutionNotes) {
    changes.push('Resolution Notes updated');
    complaint.resolutionNotes = data.resolutionNotes;
  }
  if (changes.length > 0) {
    complaint.activityLogs.push({
      actor: currentUser ? currentUser._id : null,
      actorName: currentUser ? currentUser.name : 'Staff',
      action: 'EDITED',
      description: `Updated complaint details: ${changes.join(', ')}`,
      timestamp: now,
    });
  }
  return complaint.save();
}

module.exports = {
  update,
};
