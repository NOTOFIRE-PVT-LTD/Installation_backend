const complaintRepository = require('../repositories/complaint.repository');
const ApiError = require('../utils/ApiError');
const User = require('../models/User.model');
const {
  isAssignableEngineer,
  canTransitionStatus,
  notifyTicketAssigned,
} = require('./complaintHelpers');
const { notifyCustomerTicketAssigned } = require('./complaintNotify.service');
const { resolve, reopen, addComment } = require('./complaintResolution.service');
const { update } = require('./complaintUpdateHelper');

async function acknowledge(id, currentUser) {
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (complaint.isAcknowledged) return complaint;

  const now = new Date();
  complaint.isAcknowledged = true;
  complaint.acknowledgedAt = now;
  complaint.acknowledgedBy = currentUser ? currentUser._id : null;
  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null,
    actorName: currentUser ? currentUser.name : 'Intake Desk',
    action: 'ACKNOWLEDGED',
    description: `Complaint acknowledged by ${currentUser ? currentUser.name : 'Intake Desk'}`,
    timestamp: now,
  });
  return complaint.save();
}

function recordAssignmentLogs(complaint, prevAssignedId, engineerId, engUser, reason, currentUser, now) {
  const isReassign = Boolean(prevAssignedId && prevAssignedId !== String(engineerId));
  complaint.assignmentHistory.push({
    fromEngineer: prevAssignedId,
    fromEngineerName: isReassign ? 'Previous Engineer' : 'Unassigned',
    toEngineer: engineerId,
    toEngineerName: engUser.name,
    assignedBy: currentUser ? currentUser._id : null,
    assignedByName: currentUser ? currentUser.name : 'Staff',
    reason: reason || (isReassign ? 'Reassigned by coordinator' : 'Initial assignment'),
    timestamp: now,
  });
  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null,
    actorName: currentUser ? currentUser.name : 'Staff',
    action: 'ASSIGNED',
    description: `Ticket assigned to ${engUser.name} (${engUser.department || engUser.jobRole || 'Field Service'})${reason ? `. Reason: ${reason}` : ''}`,
    timestamp: now,
  });
}

function recordAssignmentHistory(complaint, engineerId, engUser, reason, currentUser, now) {
  const prevAssignedId = complaint.assignedTo ? String(complaint.assignedTo) : null;
  const fromStatus = complaint.status;

  complaint.assignedTo = engineerId;
  complaint.assignedAt = now;
  complaint.isAcknowledged = true;
  if (complaint.status === 'NEW') complaint.status = 'ASSIGNED';

  recordAssignmentLogs(complaint, prevAssignedId, engineerId, engUser, reason, currentUser, now);

  complaint.statusHistory.push({
    fromStatus,
    toStatus: complaint.status,
    changedBy: currentUser ? currentUser._id : null,
    changedByName: currentUser ? currentUser.name : 'Staff',
    reason: `Assigned to ${engUser.name}`,
    timestamp: now,
  });
}

async function assign(id, { engineerId, reason }, currentUser) {
  if (!engineerId) throw new ApiError(400, 'Engineer ID is required for assignment.');
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const engUser = await User.findById(engineerId);
  if (!engUser) throw new ApiError(404, 'Selected engineer not found.');
  if (!isAssignableEngineer(engUser)) {
    throw new ApiError(400, 'Tickets can only be assigned to field engineers or complaint coordinators.');
  }

  const now = new Date();
  recordAssignmentHistory(complaint, engineerId, engUser, reason, currentUser, now);

  await notifyTicketAssigned(complaint, engUser, reason);
  try {
    const custLogs = await notifyCustomerTicketAssigned(complaint, engUser.name, complaint.notifyChannel);
    if (custLogs?.length) complaint.emailLogs.push(...custLogs);
  } catch (err) {
    console.warn('[ComplaintService] Assign notify error:', err.message);
  }

  return complaint.save();
}

function applyPendingRemark(complaint, reason, currentUser, now) {
  complaint.pendingRemark = reason || '';
  complaint.pendingRemarkAt = now;
  complaint.pendingRemarkBy = currentUser?.name || '';
}

function recordStatusTransition(complaint, fromStatus, nextStatus, reason, currentUser, now) {
  complaint.statusHistory.push({
    fromStatus, toStatus: nextStatus,
    changedBy: currentUser ? currentUser._id : null, changedByName: currentUser ? currentUser.name : 'Staff',
    reason: reason || `Status updated to ${nextStatus}`, timestamp: now,
  });
  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null, actorName: currentUser ? currentUser.name : 'Staff',
    action: 'STATUS_CHANGED', description: `Transitioned status from ${fromStatus} to ${nextStatus}${reason ? `. Reason: ${reason}` : ''}`,
    oldValue: fromStatus, newValue: nextStatus, timestamp: now,
  });
}

async function updateStatus(id, { nextStatus, reason }, currentUser) {
  if (!nextStatus) throw new ApiError(400, 'Next status is required.');
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const check = canTransitionStatus(complaint.status, nextStatus, currentUser?.role, currentUser?.adminType);
  if (!check.allowed) throw new ApiError(400, check.reason);

  const now = new Date();
  if (nextStatus === 'PENDING') applyPendingRemark(complaint, reason, currentUser, now);
  const fromStatus = complaint.status;
  complaint.status = nextStatus;
  complaint.isAcknowledged = true;

  if (nextStatus === 'CLOSED') {
    complaint.closedAt = now;
    complaint.closedBy = currentUser ? currentUser._id : null;
  }
  recordStatusTransition(complaint, fromStatus, nextStatus, reason, currentUser, now);
  return complaint.save();
}

function buildWorkLogEntry(workLogData, currentUser, now) {
  return {
    engineer: currentUser ? currentUser._id : null,
    engineerName: currentUser ? currentUser.name : 'Engineer',
    workDate: workLogData.workDate ? new Date(workLogData.workDate) : now,
    workPerformed: workLogData.workPerformed.trim(),
    findings: workLogData.findings ? workLogData.findings.trim() : '',
    actionTaken: workLogData.actionTaken ? workLogData.actionTaken.trim() : '',
    partsUsed: workLogData.partsUsed ? workLogData.partsUsed.trim() : '',
    testPerformed: workLogData.testPerformed ? workLogData.testPerformed.trim() : '',
    testResult: workLogData.testResult ? workLogData.testResult.trim() : '',
    nextAction: workLogData.nextAction ? workLogData.nextAction.trim() : '',
    followUpDate: workLogData.followUpDate ? new Date(workLogData.followUpDate) : null,
    remarks: workLogData.remarks ? workLogData.remarks.trim() : '',
    loggedAt: now,
  };
}

async function addWorkLog(id, workLogData, currentUser) {
  const { workPerformed } = workLogData;
  if (!workPerformed || !workPerformed.trim()) throw new ApiError(400, 'Work performed details are mandatory.');

  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');

  const now = new Date();
  complaint.workLogs.push(buildWorkLogEntry(workLogData, currentUser, now));
  if (workLogData.followUpDate) complaint.followUpDate = new Date(workLogData.followUpDate);

  if (complaint.status === 'ASSIGNED' || complaint.status === 'Open') {
    complaint.status = 'IN_PROGRESS';
    complaint.statusHistory.push({
      fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS',
      changedBy: currentUser ? currentUser._id : null,
      changedByName: currentUser ? currentUser.name : 'Engineer',
      reason: 'Work started on site / investigation work log recorded', timestamp: now,
    });
  }

  complaint.activityLogs.push({
    actor: currentUser ? currentUser._id : null, actorName: currentUser ? currentUser.name : 'Engineer',
    action: 'WORK_LOG_ADDED', description: `Work log recorded by ${currentUser ? currentUser.name : 'Engineer'}: ${workPerformed.trim().slice(0, 80)}`,
    timestamp: now,
  });

  return complaint.save();
}

module.exports = {
  acknowledge,
  assign,
  updateStatus,
  addWorkLog,
  resolve,
  reopen,
  addComment,
  update,
};
