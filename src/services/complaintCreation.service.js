const complaintRepository = require('../repositories/complaint.repository');
const uploadService = require('./upload.service');
const { notifyCustomerTicketAssigned } = require('./complaintNotify.service');
const { calculateWarrantyStatus } = require('../utils/warranty');
const { generateTicketId } = require('../utils/ticketId');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const User = require('../models/User.model');
const { dueAtFor, notifyTicketCreated } = require('./complaintHelpers');
const {
  resolveOrCreateCustomer,
  resolveEngineer,
  buildInternalComplaintPayload,
} = require('./complaintPayloadBuilder');

async function uploadFiles(files) {
  if (!files || !files.length) return [];
  try {
    if (env.cloudinary?.cloudName && env.cloudinary?.apiKey && env.cloudinary?.apiSecret) {
      return await Promise.all(files.map((file) => uploadService.uploadImageBuffer(file.buffer)));
    }
  } catch (uploadErr) {
    console.warn('[ComplaintService] Photo upload skipped:', uploadErr.message);
  }
  return [];
}

function computeWarrantyStatus(data) {
  if (!data.productSerialNumber && !data.dispatchDate) return 'UNKNOWN';
  const calc = calculateWarrantyStatus(data.dispatchDate, data.warrantyEndDate, data.warrantyMonths || 24);
  return calc.status;
}

function buildPublicEquipment(data, description, now, warrantyStatus) {
  return {
    product: String(data.product || data.productName || '').trim(),
    productName: String(data.productName || data.product || '').trim(),
    productModel: String(data.productModel || '').trim(),
    productSerialNumber: String(data.productSerialNumber || '').trim(),
    dispatchDate: data.dispatchDate ? new Date(data.dispatchDate) : null,
    installationDate: data.installationDate ? new Date(data.installationDate) : null,
    warrantyMonths: data.warrantyMonths || 24,
    warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : null,
    warrantyStatus,
    category: data.category || 'Product Quality',
    subject: String(data.subject || description.slice(0, 60)).trim(),
    description,
    customerReportedIssue: String(data.customerReportedIssue || description).trim(),
    dateIssueStarted: data.dateIssueStarted ? new Date(data.dateIssueStarted) : now,
  };
}

function buildPublicPayload(data, photos, ticketNo, now) {
  const customerName = String(data.customerName || '').trim();
  const contactNumber = String(data.contactNumber || data.customerPhone || '').trim();
  const whatsappNumber = String(data.whatsappNumber || data.whatsappMobile || contactNumber || '').trim();
  const description = String(data.description || '').trim();
  const priority = String(data.priority || 'MEDIUM').toUpperCase();

  return {
    ticketNo, source: 'SELF_SERVICE', customerName, contactNumber, whatsappNumber,
    email: String(data.email || data.customerEmail || '').trim().toLowerCase(),
    companyName: String(data.companyName || data.customerOrganization || '').trim(),
    customerOrganization: String(data.customerOrganization || data.companyName || '').trim(),
    siteName: String(data.siteName || '').trim(), location: String(data.location || data.customerLocation || '').trim(),
    customerLocation: String(data.customerLocation || data.location || '').trim(),
    ...buildPublicEquipment(data, description, now, computeWarrantyStatus(data)),
    priority, photos, status: 'NEW', isAcknowledged: false, notifyChannel: 'whatsapp', dueAt: dueAtFor(priority, now),
    activityLogs: [{
      actorName: customerName, action: 'CREATED',
      description: `Self-service complaint submitted by ${customerName}. Ticket assigned ID ${ticketNo}. Initial status: NEW`,
      newValue: `Status: NEW, Priority: ${priority}`, timestamp: now,
    }],
  };
}

async function createPublic(data, files = []) {
  const customerName = String(data.customerName || '').trim();
  const contactNumber = String(data.contactNumber || data.customerPhone || '').trim();
  const whatsappNumber = String(data.whatsappNumber || data.whatsappMobile || contactNumber || '').trim();
  const description = String(data.description || '').trim();
  if (!customerName || !contactNumber || !whatsappNumber || !description) {
    throw new ApiError(400, 'Customer name, phone number, WhatsApp number, and description are required.');
  }

  const photos = await uploadFiles(files);
  const ticketNo = await generateTicketId();
  const now = new Date();
  const payload = buildPublicPayload(data, photos, ticketNo, now);

  const complaint = await complaintRepository.create(payload);
  await notifyTicketCreated(complaint);
  if (complaint.emailLogs?.length) await complaint.save();
  return complaint;
}

async function notifyIntakeAssign(complaint, assignedTo, isStaffUser, currentUser, data) {
  if (!assignedTo) return;
  try {
    const engName = isStaffUser ? currentUser.name : data.assignedEngineerName || (await User.findById(assignedTo))?.name || 'Engineer';
    const assignLogs = await notifyCustomerTicketAssigned(complaint, engName, complaint.notifyChannel);
    if (assignLogs?.length) complaint.emailLogs.push(...assignLogs);
  } catch (err) {
    console.warn('[ComplaintService] Intake assign notify error:', err.message);
  }
}

async function createInternal(data, currentUser) {
  const customerName = String(data.customerName || '').trim();
  const contactNumber = String(data.contactNumber || data.customerPhone || '').trim();
  const whatsappNumber = String(data.whatsappNumber || data.whatsappMobile || contactNumber || '').trim();
  const description = String(data.description || '').trim();
  if (!customerName || !contactNumber || !whatsappNumber || !description) {
    throw new ApiError(400, 'Customer name, mobile number, WhatsApp number, and complaint description are required.');
  }

  const companyOrg = String(data.customerOrganization || data.companyName || '').trim();
  const customerId = await resolveOrCreateCustomer(data, customerName, contactNumber, companyOrg, currentUser);
  const ticketNo = await generateTicketId();
  const priority = String(data.priority || 'MEDIUM').toUpperCase();
  const now = new Date();
  const { assignedTo, isStaffUser } = await resolveEngineer(data, currentUser);

  const payload = buildInternalComplaintPayload(
    data,
    { customerId, assignedTo, ticketNo },
    { customerName, contactNumber, whatsappNumber, description, companyOrg, priority, initialStatus: assignedTo ? 'ASSIGNED' : 'NEW' },
    { now, dueAt: dueAtFor(priority, now) },
    { warrantyStatus: computeWarrantyStatus(data), currentUser, isStaffUser }
  );

  const complaint = await complaintRepository.create(payload);
  await notifyTicketCreated(complaint);
  await notifyIntakeAssign(complaint, assignedTo, isStaffUser, currentUser, data);
  if (complaint.emailLogs?.length) await complaint.save();
  return complaint;
}

module.exports = {
  createPublic,
  createInternal,
};
