const complaintRepository = require('../repositories/complaint.repository');
const ApiError = require('../utils/ApiError');
const { escapeRegex, maskPhoneNumber } = require('./complaintHelpers');

function verifyCustomer(complaint, verification) {
  if (!verification || !String(verification).trim().length) return;
  const clean = String(verification).trim().toLowerCase();
  const phoneMatch = complaint.contactNumber && complaint.contactNumber.includes(clean);
  const emailMatch = complaint.email && complaint.email.toLowerCase().includes(clean);
  if (!phoneMatch && !emailMatch) {
    throw new ApiError(403, 'Verification does not match the customer details on record.');
  }
}

function formatPublicTrackPayload(complaint, publicUpdates) {
  return {
    ticketNumber: complaint.ticketNo,
    status: complaint.status,
    priority: complaint.priority,
    category: complaint.category,
    subject: complaint.subject,
    description: complaint.description,
    customerName: complaint.customerName,
    customerOrganization: complaint.customerOrganization || complaint.companyName,
    customerLocation: complaint.customerLocation || complaint.location,
    customerPhoneMasked: maskPhoneNumber(complaint.contactNumber),
    productName: complaint.productName || complaint.product,
    productModel: complaint.productModel,
    productSerialNumber: complaint.productSerialNumber,
    warrantyStatus: complaint.warrantyStatus,
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
    assignedEngineer: complaint.assignedTo ? {
      name: complaint.assignedTo.name,
      department: complaint.assignedTo.department || complaint.assignedTo.jobRole || 'Field Service',
      assignedAt: complaint.assignedAt || complaint.assignmentHistory?.[complaint.assignmentHistory.length - 1]?.timestamp || null,
    } : null,
    publicUpdates,
    isResolved: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(complaint.status),
    resolutionSummary: complaint.resolutionSummary || complaint.resolutionNotes || null,
    resolutionDate: complaint.resolvedAt,
  };
}

async function publicTrack({ ticketNumber, verification }) {
  if (!ticketNumber || !ticketNumber.trim()) throw new ApiError(400, 'Ticket number is required.');
  const clean = ticketNumber.trim().toUpperCase();
  const complaint = await complaintRepository.model
    .findOne({ $or: [{ ticketNo: clean }, { ticketNo: new RegExp(escapeRegex(clean), 'i') }] })
    .populate('assignedTo', 'name department jobRole');
  if (!complaint) throw new ApiError(404, 'No service complaint found matching the provided Ticket ID.');

  verifyCustomer(complaint, verification);

  const publicUpdates = (complaint.comments || [])
    .filter((c) => c.visibility === 'CUSTOMER_VISIBLE')
    .map((c) => ({ id: c._id, authorName: c.authorName || 'Service Desk', content: c.content, createdAt: c.createdAt }));

  return formatPublicTrackPayload(complaint, publicUpdates);
}

module.exports = {
  verifyCustomer,
  formatPublicTrackPayload,
  publicTrack,
};
