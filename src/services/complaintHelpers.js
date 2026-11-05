const mongoose = require('mongoose');
const { ROLES, JOB_ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const {
  notifyCustomerTicketCreated,
  notifyCustomerTicketResolved,
} = require('./complaintNotify.service');

const ALLOWED_SORT_FIELDS = [
  'ticketNo',
  'status',
  'priority',
  'dueAt',
  'followUpDate',
  'createdAt',
  'updatedAt',
  'resolvedAt',
];

const COMPLAINT_SLA_HOURS = {
  LOW: 72,
  Low: 72,
  MEDIUM: 48,
  Medium: 48,
  HIGH: 24,
  High: 24,
  CRITICAL: 4,
  Critical: 4,
};

function escapeRegex(value) {
  return String(value).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function isAssignableEngineer(user) {
  return user?.role === ROLES.USER && user?.jobRole !== JOB_ROLES.SALESPERSON;
}

function applyPendingRemark(complaint, remark, currentUser, now) {
  const text = String(remark || '').trim();
  if (!text) throw new ApiError(400, 'A remark is required when marking a ticket as Pending.');
  complaint.pendingRemark = text;
  complaint.pendingRemarkAt = now;
  complaint.pendingRemarkBy = currentUser?.name || 'Staff';
}

function dueAtFor(priority, from = new Date()) {
  const norm = String(priority || 'MEDIUM').toUpperCase();
  const hours = COMPLAINT_SLA_HOURS[norm] || 48;
  return new Date(new Date(from).getTime() + hours * 60 * 60 * 1000);
}

function maskPhoneNumber(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  if (str.length <= 4) return '****';
  return str.slice(0, Math.max(0, str.length - 5)) + '*****';
}

function parseStatusFilter(status) {
  const parts = status.includes(',') ? status.split(',').map((s) => s.trim()) : [status.trim()];
  const expanded = [];
  for (const st of parts) {
    expanded.push(
      st,
      st.toUpperCase(),
      st.toLowerCase(),
      st.charAt(0).toUpperCase() + st.slice(1).toLowerCase()
    );
  }
  return { $in: [...new Set(expanded)] };
}

function appendRoleAndAssignedClauses(query, currentUser, filter, andClauses) {
  if (currentUser && currentUser.role === 'User') {
    andClauses.push({ assignedTo: currentUser._id });
  } else if (query.myTickets === 'true' && currentUser) {
    andClauses.push({ assignedTo: currentUser._id });
  } else if (query.assignedTo) {
    if (query.assignedTo === 'unassigned') filter.assignedTo = null;
    else if (mongoose.isValidObjectId(query.assignedTo)) filter.assignedTo = query.assignedTo;
  }
  if (query.engineerId && mongoose.isValidObjectId(query.engineerId)) {
    filter.assignedTo = query.engineerId;
  }
}

function appendSearchClause(search, andClauses) {
  if (!search) return;
  const regex = new RegExp(escapeRegex(search), 'i');
  andClauses.push({
    $or: [
      { ticketNo: regex },
      { customerName: regex },
      { contactNumber: regex },
      { email: regex },
      { customerOrganization: regex },
      { customerLocation: regex },
      { companyName: regex },
      { siteName: regex },
      { product: regex },
      { productName: regex },
      { productSerialNumber: regex },
      { subject: regex },
    ],
  });
}

function appendCategoryFilters(query, filter) {
  if (query.isNewOnly === 'true') {
    filter.status = 'NEW';
    filter.isAcknowledged = false;
  } else if (query.status) {
    filter.status = parseStatusFilter(query.status);
  }
  if (query.priority) {
    const p = query.priority.trim();
    filter.priority = { $in: [p, p.toUpperCase(), p.toLowerCase(), p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()] };
  }
  if (query.category) filter.category = query.category;
  if (query.warrantyStatus) filter.warrantyStatus = query.warrantyStatus;
  if (query.source) filter.source = query.source;
}

function appendDueAndUpcomingClauses(query, now, andClauses) {
  if (query.isOverdue === 'true' || query.overdue === 'true') {
    andClauses.push({
      $or: [{ dueAt: { $lt: now } }, { followUpDate: { $lt: now } }],
      status: { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] },
    });
  } else if (query.isUpcoming === 'true' || query.upcoming === 'true') {
    andClauses.push({
      followUpDate: { $gte: now },
      status: { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] },
    });
  }
}

function buildFilter(query = {}, currentUser = null) {
  const filter = {};
  const andClauses = [];
  const now = new Date();

  appendRoleAndAssignedClauses(query, currentUser, filter, andClauses);
  appendCategoryFilters(query, filter);
  appendDueAndUpcomingClauses(query, now, andClauses);
  appendSearchClause(String(query.search || '').trim(), andClauses);

  if (andClauses.length) filter.$and = andClauses;
  return filter;
}

async function notifyTicketCreated(complaint) {
  const logs = await notifyCustomerTicketCreated(complaint, complaint.notifyChannel);
  if (logs?.length) complaint.emailLogs.push(...logs);
}

async function notifyTicketResolved(complaint) {
  const logs = await notifyCustomerTicketResolved(complaint, complaint.notifyChannel);
  if (logs?.length) complaint.emailLogs.push(...logs);
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  COMPLAINT_SLA_HOURS,
  escapeRegex,
  isAssignableEngineer,
  applyPendingRemark,
  dueAtFor,
  maskPhoneNumber,
  buildFilter,
  notifyTicketCreated,
  notifyTicketResolved,
};
