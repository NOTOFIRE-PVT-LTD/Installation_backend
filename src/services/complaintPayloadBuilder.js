const Customer = require('../models/Customer.model');
const User = require('../models/User.model');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/constants');
const { escapeRegex, isAssignableEngineer } = require('./complaintHelpers');

async function findExistingCustomerId(contactNumber, companyOrg) {
  const phoneDigits = (contactNumber || '').replace(/\D/g, '');
  const orLookups = [];
  if (contactNumber) orLookups.push({ phone: contactNumber });
  if (phoneDigits) orLookups.push({ phoneNormalized: phoneDigits });
  if (companyOrg) {
    orLookups.push({ normalizedCompanyName: companyOrg.toLowerCase() }, { companyName: new RegExp(`^${escapeRegex(companyOrg)}$`, 'i') });
  }
  if (!orLookups.length) return null;
  const existing = await Customer.findOne({ $or: orLookups });
  return existing ? existing._id : null;
}

async function createAutoCustomer(data, customerName, contactNumber, companyOrg, currentUser) {
  const finalName = companyOrg || customerName;
  if (!finalName) return null;
  try {
    const newCust = await Customer.create({
      companyName: finalName,
      normalizedCompanyName: finalName.toLowerCase(),
      contactPerson: customerName !== finalName ? customerName : '',
      phone: contactNumber,
      phoneNormalized: (contactNumber || '').replace(/\D/g, ''),
      email: String(data.email || '').trim().toLowerCase(),
      address: String(data.customerLocation || data.location || '').trim(),
      city: String(data.customerLocation || data.location || '').trim(),
      active: true,
      createdBy: currentUser ? currentUser._id : null,
    });
    return newCust._id;
  } catch (err) {
    console.warn('[ComplaintService] Could not auto-create Customer:', err.message);
    return null;
  }
}

async function resolveOrCreateCustomer(data, customerName, contactNumber, companyOrg, currentUser) {
  if (data.customerId) return data.customerId;
  const existingId = await findExistingCustomerId(contactNumber, companyOrg);
  if (existingId) return existingId;
  return createAutoCustomer(data, customerName, contactNumber, companyOrg, currentUser);
}

async function resolveEngineer(data, currentUser) {
  const isStaffUser = currentUser?.role === ROLES.USER;
  const assignedTo = isStaffUser ? currentUser._id : data.assignedTo || data.assignedEngineerId || null;
  if (!isStaffUser && assignedTo) {
    const engUser = await User.findById(assignedTo);
    if (!engUser || !isAssignableEngineer(engUser)) {
      throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
    }
  }
  return { assignedTo, isStaffUser };
}

function buildEquipmentInfo(data, description, now, warrantyStatus) {
  return {
    product: String(data.product || data.productName || '').trim(),
    productName: String(data.productName || data.product || '').trim(),
    productModel: String(data.productModel || '').trim(),
    productSerialNumber: String(data.productSerialNumber || data.panelSerialNo || '').trim(),
    dispatchDate: data.dispatchDate ? new Date(data.dispatchDate) : null,
    installationDate: data.installationDate ? new Date(data.installationDate) : null,
    warrantyMonths: data.warrantyMonths || 24,
    warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : null,
    warrantyStatus: data.warrantyStatus || warrantyStatus,
    category: data.category || 'Product Quality',
    subject: String(data.subject || data.problem || description.slice(0, 60)).trim(),
    description,
    customerReportedIssue: String(data.customerReportedIssue || data.problem || description).trim(),
    dateIssueStarted: data.complaintDate || data.dateIssueStarted ? new Date(data.complaintDate || data.dateIssueStarted) : now,
  };
}

function buildIntakeAssignment(assignedTo, isStaffUser, currentUser, data, now) {
  if (!assignedTo) return [];
  return [{
    fromEngineer: null, fromEngineerName: 'Unassigned', toEngineer: assignedTo,
    toEngineerName: isStaffUser ? currentUser.name : data.assignedEngineerName || 'Engineer',
    assignedBy: currentUser ? currentUser._id : null, assignedByName: currentUser ? currentUser.name : 'Staff',
    reason: 'Initial assignment during intake', timestamp: now,
  }];
}

function buildIntakeMetadata(data, initialStatus, assignedTo, currentUser, now, dueAt, priority, ticketNo) {
  return {
    status: initialStatus, isAcknowledged: Boolean(assignedTo), acknowledgedAt: assignedTo ? now : null,
    pendingRemark: String(data.pendingRemark || data.pendingReason || '').trim(),
    pendingRemarkAt: data.pendingRemark || data.pendingReason ? now : null,
    pendingRemarkBy: data.pendingRemark || data.pendingReason ? (currentUser?.name || '') : '',
    complaintReceiverName: String(data.complaintReceiverName || currentUser?.name || '').trim(),
    solutions: String(data.solutions || '').trim(), takenTime: String(data.takenTime || '').trim(),
    attempt: Math.max(1, Number(data.attempt) || 1), deliveryStatus: String(data.deliveryStatus || '').trim(),
    notifyChannel: 'whatsapp', assignedTo, assignedAt: assignedTo ? now : null, priority,
    complaintHandlerId: currentUser ? currentUser._id : null, createdBy: currentUser ? currentUser._id : null,
    dueAt, followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
    activityLogs: [{
      actor: currentUser ? currentUser._id : null, actorName: currentUser ? currentUser.name : 'Intake Desk',
      action: 'CREATED', description: `Internal phone complaint registered by ${currentUser ? currentUser.name : 'Staff'}. Ticket ${ticketNo} created.`,
      newValue: `Status: ${initialStatus}, Priority: ${priority}`, timestamp: now,
    }],
  };
}

function buildInternalComplaintPayload(data, ids, names, dates, values) {
  const { customerId, assignedTo, ticketNo } = ids;
  const { customerName, contactNumber, whatsappNumber, description, companyOrg, priority, initialStatus } = names;
  const { now, dueAt } = dates;
  const { warrantyStatus, currentUser, isStaffUser } = values;

  return {
    ticketNo, source: data.source || 'PHONE', customerId, customerName, contactNumber, whatsappNumber,
    email: String(data.email || data.customerEmail || '').trim().toLowerCase(),
    companyName: companyOrg, customerOrganization: companyOrg,
    siteName: String(data.siteName || data.stationName || data.customerLocation || '').trim(),
    location: String(data.location || data.customerLocation || data.siteName || data.stationName || '').trim(),
    customerLocation: String(data.customerLocation || data.siteName || data.stationName || data.location || '').trim(),
    ...buildEquipmentInfo(data, description, now, warrantyStatus),
    ...buildIntakeMetadata(data, initialStatus, assignedTo, currentUser, now, dueAt, priority, ticketNo),
    assignmentHistory: buildIntakeAssignment(assignedTo, isStaffUser, currentUser, data, now),
  };
}

module.exports = {
  resolveOrCreateCustomer,
  resolveEngineer,
  buildInternalComplaintPayload,
};
