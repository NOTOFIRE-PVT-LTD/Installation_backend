const complaintRepository = require('../repositories/complaint.repository');
const ApiError = require('../utils/ApiError');
const User = require('../models/User.model');
const { isAssignableEngineer, notifyTicketResolved } = require('./complaintHelpers');

function recordResolutionStatus(complaint, fromStatus, resolutionSummary, currentUser, now) {
  complaint.statusHistory.push({
    fromStatus,
    toStatus: 'RESOLVED',
    changedBy: currentUser ? currentUser._id : null,
    changedByName: currentUser ? currentUser.name : 'Staff',
    reason: resolutionSummary.trim(),
    timestamp: now,
  });

  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null,
    actorName: currentUser ? currentUser.name : 'Staff',
    action: 'RESOLVED',
    description: `Complaint resolved by ${currentUser ? currentUser.name : 'Staff'}. Summary: ${resolutionSummary.trim()}`,
    oldValue: fromStatus,
    newValue: 'RESOLVED',
    timestamp: now,
  });
}

async function resolve(id, resolutionData, currentUser) {
  const { resolutionReason, resolutionActionTaken, resolutionSummary } = resolutionData;
  if (!resolutionReason || !resolutionActionTaken || !resolutionSummary) {
    throw new ApiError(400, 'Mandatory resolution fields missing: Root cause, action taken, and resolution summary are all required.');
  }

  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const now = new Date();
  const fromStatus = complaint.status;

  complaint.status = 'RESOLVED';
  complaint.resolvedAt = now;
  complaint.resolvedBy = currentUser ? currentUser._id : null;
  complaint.resolutionReason = resolutionReason.trim();
  complaint.resolutionActionTaken = resolutionActionTaken.trim();
  complaint.resolutionSummary = resolutionSummary.trim();
  complaint.resolutionRemarks = resolutionData.resolutionRemarks ? resolutionData.resolutionRemarks.trim() : '';
  complaint.resolutionPartsUsed = resolutionData.resolutionPartsUsed ? resolutionData.resolutionPartsUsed.trim() : '';

  recordResolutionStatus(complaint, fromStatus, resolutionSummary, currentUser, now);
  await notifyTicketResolved(complaint);
  return complaint.save();
}

function recordReopenStatus(complaint, fromStatus, reason, currentUser, now) {
  complaint.statusHistory.push({
    fromStatus,
    toStatus: 'REOPENED',
    changedBy: currentUser ? currentUser._id : null,
    changedByName: currentUser ? currentUser.name : 'Staff',
    reason: reason.trim(),
    timestamp: now,
  });

  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null,
    actorName: currentUser ? currentUser.name : 'Staff',
    action: 'REOPENED',
    description: `Reopened ticket. Justification: ${reason.trim()}`,
    oldValue: fromStatus,
    newValue: 'REOPENED',
    timestamp: now,
  });
}

async function handleReopenReassign(complaint, reassignToEngineerId, now) {
  if (!reassignToEngineerId) return;
  const engUser = await User.findById(reassignToEngineerId);
  if (!engUser || !isAssignableEngineer(engUser)) {
    throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
  }
  complaint.assignedTo = reassignToEngineerId;
  complaint.assignedAt = now;
}

async function reopen(id, { reason, reassignToEngineerId }, currentUser) {
  if (!reason || !reason.trim()) throw new ApiError(400, 'Reason for reopening the ticket is mandatory.');
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (!['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(complaint.status)) {
    throw new ApiError(400, 'Only RESOLVED or CLOSED tickets can be reopened.');
  }

  const now = new Date();
  const fromStatus = complaint.status;
  complaint.status = 'REOPENED';
  complaint.reopenedAt = now;
  complaint.reopenedBy = currentUser ? currentUser._id : null;
  complaint.reopenReason = reason.trim();
  complaint.isAcknowledged = true;

  await handleReopenReassign(complaint, reassignToEngineerId, now);
  recordReopenStatus(complaint, fromStatus, reason, currentUser, now);
  return complaint.save();
}

async function addComment(id, { content, visibility = 'INTERNAL' }, currentUser) {
  if (!content || !content.trim()) throw new ApiError(400, 'Comment content is required.');
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const now = new Date();
  const comment = {
    author: currentUser ? currentUser._id : null,
    authorName: currentUser ? currentUser.name : 'Staff',
    content: content.trim(),
    visibility,
    createdAt: now,
  };
  complaint.comments.push(comment);

  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null,
    actorName: currentUser ? currentUser.name : 'Staff',
    action: 'COMMENT_ADDED',
    description: `Added a ${visibility === 'CUSTOMER_VISIBLE' ? 'public' : 'private'} note: ${content.trim().slice(0, 60)}`,
    timestamp: now,
  });

  return complaint.save();
}

module.exports = {
  resolve,
  reopen,
  addComment,
};
