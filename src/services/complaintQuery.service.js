const complaintRepository = require('../repositories/complaint.repository');
const ApiError = require('../utils/ApiError');
const { ROLES, JOB_ROLES } = require('../config/constants');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { calculateWarrantyStatus } = require('../utils/warranty');
const User = require('../models/User.model');
const Permission = require('../models/Permission.model');
const {
  ALLOWED_SORT_FIELDS,
  escapeRegex,
  buildFilter,
} = require('./complaintHelpers');
const { publicTrack } = require('./complaintPublicTrack.service');

async function list(query = {}, currentUser = null) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = { ...buildSort(query, ALLOWED_SORT_FIELDS, { createdAt: -1 }), _id: -1 };
  const filter = buildFilter(query, currentUser);
  const { items, total } = await complaintRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: [
      { path: 'assignedTo', select: 'name email phone department' },
      { path: 'complaintHandlerId', select: 'name email phone' },
    ],
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function findCompanyHistory(complaint) {
  const company = complaint.companyName || complaint.customerOrganization;
  const phone = complaint.contactNumber;
  const historyOr = [];
  if (complaint.customerId) historyOr.push({ customerId: complaint.customerId });
  if (company && company.length > 2) {
    historyOr.push(
      { companyName: new RegExp(`^${escapeRegex(company)}$`, 'i') },
      { customerOrganization: new RegExp(`^${escapeRegex(company)}$`, 'i') }
    );
  }
  if (phone && phone.length >= 7) historyOr.push({ contactNumber: phone });
  if (!historyOr.length) return [];
  return complaintRepository.find(
    { _id: { $ne: complaint._id }, $or: historyOr },
    { sort: { createdAt: -1 }, limit: 15, select: 'ticketNo subject status priority createdAt resolvedAt product productName category' }
  );
}

async function getById(id) {
  const complaint = await complaintRepository.findByTicketOrId(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  const doc = complaint.toObject();
  doc.calculatedWarranty = calculateWarrantyStatus(complaint.dispatchDate, complaint.warrantyEndDate, complaint.warrantyMonths || 24);
  doc.companyHistory = await findCompanyHistory(complaint);
  return doc;
}

function formatEngineerRole(eng) {
  const name = eng?.name || '';
  if (eng?.adminType === 'COMPLAINT_COORDINATOR') return 'Complaint Coordinator';
  if (name.includes('Railway S&T')) return 'Railway S&T Specialist';
  if (name.includes('Field Service')) return 'Field Service Specialist';
  if (name.includes('Commissioning Lead')) return 'Commissioning Lead';
  if (name.includes('Installation Spec.')) return 'Field Installation Specialist';
  if (name.includes('Field Support')) return 'Field Technical Support';
  return 'Field Engineer';
}

async function fetchEngineersList(currentUser) {
  if (currentUser?.role === 'User') return [];
  const permDocs = await Permission.find({ complaints: true }).select('user');
  const allowedUserIds = permDocs.map((p) => String(p.user));
  const filter = {
    status: 'active',
    isDeleted: { $ne: true },
    jobRole: { $ne: 'SALESPERSON' },
    adminType: { $nin: ['SUPER_ADMIN', 'SALES_COORDINATOR', 'TENDER_COORDINATOR'] },
  };
  if (allowedUserIds.length > 0) {
    filter.$or = [{ _id: { $in: allowedUserIds } }, { adminType: 'COMPLAINT_COORDINATOR' }];
  }
  return User.find(filter).select('name email mobileNumber phone jobRole adminType').sort({ name: 1 });
}

function computeWorkloads(engineers, activeTickets) {
  return engineers.map((eng) => {
    const tickets = activeTickets.filter((t) => String(t.assignedTo) === String(eng._id));
    const assigned = tickets.filter((t) => t.status === 'ASSIGNED').length;
    const inProgress = tickets.filter((t) => ['IN_PROGRESS', 'PENDING', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_PART', 'In Progress'].includes(t.status)).length;
    const resolved = tickets.filter((t) => ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(t.status)).length;
    return {
      id: eng._id,
      name: eng.name,
      email: eng.email,
      phone: eng.mobileNumber || eng.phone || '',
      department: formatEngineerRole(eng),
      assigned,
      inProgress,
      resolved,
      totalActive: assigned + inProgress,
    };
  });
}

async function fetchKpiCounts(mine, activeStatusFilter, now) {
  return Promise.all([
    complaintRepository.countDocuments({ ...mine, status: { $in: ['NEW', 'Open'] }, isAcknowledged: false }),
    complaintRepository.countDocuments({ ...mine, status: activeStatusFilter }),
    complaintRepository.countDocuments({ ...mine, status: 'ASSIGNED' }),
    complaintRepository.countDocuments({ ...mine, status: { $in: ['IN_PROGRESS', 'PENDING', 'In Progress'] } }),
    complaintRepository.countDocuments({ ...mine, status: { $in: ['PENDING', 'WAITING_FOR_CUSTOMER'] } }),
    complaintRepository.countDocuments({ ...mine, status: 'WAITING_FOR_PART' }),
    complaintRepository.countDocuments({ ...mine, status: { $in: ['RESOLVED', 'Resolved'] } }),
    complaintRepository.countDocuments({ ...mine, status: { $in: ['CLOSED', 'Closed'] } }),
    complaintRepository.countDocuments({ ...mine, $or: [{ followUpDate: { $lt: now } }, { dueAt: { $lt: now } }], status: activeStatusFilter }),
    complaintRepository.countDocuments({ ...mine, followUpDate: { $gte: now }, status: activeStatusFilter }),
    complaintRepository.countDocuments({ assignedTo: null, status: activeStatusFilter }),
  ]);
}

async function fetchListsAndEngineers(mine, activeStatusFilter, now, currentUser) {
  return Promise.all([
    complaintRepository.find({ ...mine, status: { $in: ['NEW', 'Open'] }, isAcknowledged: false }, { sort: { createdAt: -1 }, limit: 6, populate: [{ path: 'assignedTo', select: 'name email' }] }),
    complaintRepository.find({ ...mine }, { sort: { updatedAt: -1 }, limit: 8, populate: [{ path: 'assignedTo', select: 'name email' }] }),
    complaintRepository.find({ ...mine, followUpDate: { $gte: now }, status: activeStatusFilter }, { sort: { followUpDate: 1 }, limit: 6, populate: [{ path: 'assignedTo', select: 'name email' }] }),
    complaintRepository.find({ ...mine, $or: [{ followUpDate: { $lt: now } }, { dueAt: { $lt: now } }], status: activeStatusFilter }, { sort: { followUpDate: 1 }, limit: 6, populate: [{ path: 'assignedTo', select: 'name email' }] }),
    fetchEngineersList(currentUser),
  ]);
}

async function getDashboardMetrics(currentUser = null) {
  const now = new Date();
  const activeStatusFilter = { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] };
  const mine = currentUser?.role === 'User' ? { assignedTo: currentUser._id } : {};

  const [counts, [unprocessedNewTickets, recentTickets, upcomingFollowUps, overdueTickets, engineers]] = await Promise.all([
    fetchKpiCounts(mine, activeStatusFilter, now),
    fetchListsAndEngineers(mine, activeStatusFilter, now, currentUser),
  ]);
  const [newTicketsCount, totalOpenCount, assignedCount, inProgressCount, waitingCustomerCount, waitingPartCount, resolvedCount, closedCount, overdueCount, upcomingCount, unassignedCount] = counts;

  const activeTickets = await complaintRepository.find({ assignedTo: { $in: engineers.map((e) => e._id) } }, { select: 'assignedTo status' });
  const myTicketsCount = currentUser?.role === 'User'
    ? await complaintRepository.countDocuments({ assignedTo: currentUser._id })
    : activeTickets.filter((t) => String(t.assignedTo) === String(currentUser?._id)).length;

  return {
    kpis: { newTicketsCount, totalOpenCount, assignedCount, inProgressCount, waitingCustomerCount, waitingPartCount, resolvedCount, closedCount, overdueCount, upcomingCount, unassignedCount, myTicketsCount },
    unprocessedNewTickets, recentTickets, upcomingFollowUps, overdueTickets,
    engineerWorkload: computeWorkloads(engineers, activeTickets),
  };
}

async function checkDuplicate({ phone, serialNumber }) {
  const conditions = [];
  if (phone && String(phone).trim().length >= 7) conditions.push({ contactNumber: String(phone).trim() });
  if (serialNumber && String(serialNumber).trim().length >= 3) conditions.push({ productSerialNumber: String(serialNumber).trim() });
  if (!conditions.length) return { isDuplicate: false, message: null, existingTickets: [] };

  const existingTickets = await complaintRepository.find({
    filter: { $or: conditions, status: { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] } },
    limit: 5,
    select: 'ticketNo customerName contactNumber productSerialNumber status createdAt',
  });
  if (existingTickets.length > 0) {
    const ticketNos = existingTickets.map((t) => t.ticketNo).join(', ');
    return { isDuplicate: true, message: `Active complaint found for this customer or equipment (${ticketNos}). Previous tickets are still open.`, existingTickets };
  }
  return { isDuplicate: false, message: null, existingTickets: [] };
}

async function getAssignees() {
  const permDocs = await Permission.find({ complaints: true }).select('user');
  const allowedUserIds = permDocs.map((p) => p.user);
  const filter = { status: 'active', isDeleted: { $ne: true }, role: ROLES.USER, jobRole: { $ne: JOB_ROLES.SALESPERSON } };
  if (allowedUserIds.length > 0) filter._id = { $in: allowedUserIds };

  const users = await User.find(filter).select('name email mobileNumber role adminType jobRole').sort({ name: 1 });
  return users.map((u) => ({
    _id: u._id,
    id: u._id,
    name: u.name,
    email: u.email,
    phone: u.mobileNumber,
    role: u.role,
    jobRole: formatEngineerRole(u),
  }));
}

module.exports = {
  list,
  getById,
  getDashboardMetrics,
  checkDuplicate,
  getAssignees,
  publicTrack,
};
