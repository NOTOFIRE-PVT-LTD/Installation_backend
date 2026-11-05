const mongoose = require('mongoose');
const complaintRepository = require('../repositories/complaint.repository');
const userRepository = require('../repositories/user.repository');
const uploadService = require('./upload.service');
const {
  notifyCustomerTicketCreated,
  notifyCustomerTicketResolved,
  notifyCustomerTicketAssigned,
} = require('./complaintNotify.service');
const { calculateWarrantyStatus } = require('../utils/warranty');
const { canTransitionStatus } = require('../utils/statusFlow');
const { generateTicketId } = require('../utils/ticketId');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { ROLES, JOB_ROLES } = require('../config/constants');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { kolkataToday } = require('../utils/kolkataDate');
const Customer = require('../models/Customer.model');
const User = require('../models/User.model');
const Permission = require('../models/Permission.model');

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

function buildFilter(query = {}, currentUser = null) {
  const filter = {};
  const andClauses = [];
  const now = new Date();

  // Role scoping: if field engineer (User), scope to their assigned complaints
  if (currentUser && currentUser.role === 'User') {
    andClauses.push({ assignedTo: currentUser._id });
  } else if (query.myTickets === 'true' && currentUser) {
    andClauses.push({ assignedTo: currentUser._id });
  } else if (query.assignedTo) {
    if (query.assignedTo === 'unassigned') {
      filter.assignedTo = null;
    } else if (mongoose.isValidObjectId(query.assignedTo)) {
      filter.assignedTo = query.assignedTo;
    }
  }

  if (query.engineerId && mongoose.isValidObjectId(query.engineerId)) {
    filter.assignedTo = query.engineerId;
  }

  if (query.isNewOnly === 'true') {
    filter.status = 'NEW';
    filter.isAcknowledged = false;
  } else if (query.status) {
    if (query.status.includes(',')) {
      const parts = query.status.split(',').map((s) => s.trim());
      const expanded = [];
      for (const st of parts) {
        expanded.push(
          st,
          st.toUpperCase(),
          st.toLowerCase(),
          st.charAt(0).toUpperCase() + st.slice(1).toLowerCase()
        );
      }
      filter.status = { $in: [...new Set(expanded)] };
    } else {
      const st = query.status.trim();
      filter.status = {
        $in: [
          st,
          st.toUpperCase(),
          st.toLowerCase(),
          st.charAt(0).toUpperCase() + st.slice(1).toLowerCase(),
        ],
      };
    }
  }

  if (query.priority) {
    const prio = query.priority.trim();
    filter.priority = { $in: [prio, prio.toUpperCase(), prio.toLowerCase(), prio.charAt(0).toUpperCase() + prio.slice(1).toLowerCase()] };
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.warrantyStatus) {
    filter.warrantyStatus = query.warrantyStatus;
  }

  if (query.source) {
    filter.source = query.source;
  }

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

  const search = String(query.search || '').trim();
  if (search) {
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

class ComplaintService {
  async list(query = {}, currentUser = null) {
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

  async getById(id) {
    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    // Dynamically re-evaluate warranty if serial number exists
    const calculatedWarranty = calculateWarrantyStatus(
      complaint.dispatchDate,
      complaint.warrantyEndDate,
      complaint.warrantyMonths || 24
    );

    const doc = complaint.toObject();
    doc.calculatedWarranty = calculatedWarranty;

    // Fetch company/customer's full complaint history (other issues reported by this company)
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

    if (historyOr.length > 0) {
      doc.companyHistory = await complaintRepository.find(
        {
          _id: { $ne: complaint._id },
          $or: historyOr,
        },
        {
          sort: { createdAt: -1 },
          limit: 15,
          select: 'ticketNo subject status priority createdAt resolvedAt product productName category',
        }
      );
    } else {
      doc.companyHistory = [];
    }

    return doc;
  }

  async getDashboardMetrics(currentUser = null) {
    const now = new Date();
    const activeStatusFilter = { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] };
    const mine = currentUser?.role === 'User' ? { assignedTo: currentUser._id } : {};

    const [
      newTicketsCount,
      totalOpenCount,
      assignedCount,
      inProgressCount,
      waitingCustomerCount,
      waitingPartCount,
      resolvedCount,
      closedCount,
      overdueCount,
      upcomingCount,
      unassignedCount,
      unprocessedNewTickets,
      recentTickets,
      upcomingFollowUps,
      overdueTickets,
      engineers,
    ] = await Promise.all([
      // Unprocessed New Tickets (Section 10 & 36)
      complaintRepository.countDocuments({ ...mine, status: { $in: ['NEW', 'Open'] }, isAcknowledged: false }),
      // Total Open Tickets
      complaintRepository.countDocuments({ ...mine, status: activeStatusFilter }),
      // Assigned
      complaintRepository.countDocuments({ ...mine, status: 'ASSIGNED' }),
      // In Progress
      complaintRepository.countDocuments({ ...mine, status: { $in: ['IN_PROGRESS', 'PENDING', 'In Progress'] } }),
      // Waiting Customer
      complaintRepository.countDocuments({ ...mine, status: { $in: ['PENDING', 'WAITING_FOR_CUSTOMER'] } }),
      // Waiting Part
      complaintRepository.countDocuments({ ...mine, status: 'WAITING_FOR_PART' }),
      // Resolved
      complaintRepository.countDocuments({ ...mine, status: { $in: ['RESOLVED', 'Resolved'] } }),
      // Closed
      complaintRepository.countDocuments({ ...mine, status: { $in: ['CLOSED', 'Closed'] } }),
      // Overdue Follow-ups
      complaintRepository.countDocuments({
        ...mine,
        $or: [{ followUpDate: { $lt: now } }, { dueAt: { $lt: now } }],
        status: activeStatusFilter,
      }),
      // Upcoming Follow-ups
      complaintRepository.countDocuments({
        ...mine,
        followUpDate: { $gte: now },
        status: activeStatusFilter,
      }),
      // Unassigned active tickets
      complaintRepository.countDocuments({ assignedTo: null, status: activeStatusFilter }),
      // Section 1: Unprocessed New Complaints (latest first)
      complaintRepository.find(
        { ...mine, status: { $in: ['NEW', 'Open'] }, isAcknowledged: false },
        {
          sort: { createdAt: -1 },
          limit: 6,
          populate: [{ path: 'assignedTo', select: 'name email' }],
        }
      ),
      // Section 2: Recent Activity
      complaintRepository.find(
        { ...mine },
        {
          sort: { updatedAt: -1 },
          limit: 8,
          populate: [{ path: 'assignedTo', select: 'name email' }],
        }
      ),
      // Section 3: Upcoming Follow-ups
      complaintRepository.find(
        {
          ...mine,
          followUpDate: { $gte: now },
          status: activeStatusFilter,
        },
        {
          sort: { followUpDate: 1 },
          limit: 6,
          populate: [{ path: 'assignedTo', select: 'name email' }],
        }
      ),
      // Section 4: Overdue Follow-ups
      complaintRepository.find(
        {
          ...mine,
          $or: [{ followUpDate: { $lt: now } }, { dueAt: { $lt: now } }],
          status: activeStatusFilter,
        },
        {
          sort: { followUpDate: 1 },
          limit: 6,
          populate: [{ path: 'assignedTo', select: 'name email' }],
        }
      ),
      // Section 5: Engineer Workload List (Field Engineers & Complaint Specialists only)
      (async () => {
        if (currentUser?.role === 'User') return [];
        const permDocs = await Permission.find({ complaints: true }).select('user');
        const allowedUserIds = permDocs.map((p) => String(p.user));
        const engineerFilter = {
          status: 'active',
          isDeleted: { $ne: true },
          jobRole: { $ne: 'SALESPERSON' },
          adminType: { $nin: ['SUPER_ADMIN', 'SALES_COORDINATOR', 'TENDER_COORDINATOR'] },
        };
        if (allowedUserIds.length > 0) {
          engineerFilter.$or = [
            { _id: { $in: allowedUserIds } },
            { adminType: 'COMPLAINT_COORDINATOR' },
          ];
        }
        return User.find(engineerFilter)
          .select('name email mobileNumber phone jobRole adminType')
          .sort({ name: 1 });
      })(),
    ]);

    // Compute workload distribution for each engineer
    const engineerIds = engineers.map((e) => e._id);
    const activeTicketsByEngineer = await complaintRepository.find(
      { assignedTo: { $in: engineerIds } },
      { select: 'assignedTo status' }
    );

    function formatEngineerRole(eng) {
      const name = eng.name || '';
      if (eng.adminType === 'COMPLAINT_COORDINATOR') return 'Complaint Coordinator';
      if (name.includes('Railway S&T')) return 'Railway S&T Specialist';
      if (name.includes('Field Service')) return 'Field Service Specialist';
      if (name.includes('Commissioning Lead')) return 'Commissioning Lead';
      if (name.includes('Installation Spec.')) return 'Field Installation Specialist';
      if (name.includes('Field Support')) return 'Field Technical Support';
      return 'Field Engineer';
    }

    const myTicketsCount =
      currentUser?.role === 'User'
        ? await complaintRepository.countDocuments({ assignedTo: currentUser._id })
        : activeTicketsByEngineer.filter(
            (t) => String(t.assignedTo) === String(currentUser?._id)
          ).length;

    const engineerWorkload = engineers.map((eng) => {
      const tickets = activeTicketsByEngineer.filter(
        (t) => String(t.assignedTo) === String(eng._id)
      );
      const assigned = tickets.filter((t) => t.status === 'ASSIGNED').length;
      const inProgress = tickets.filter((t) =>
        ['IN_PROGRESS', 'PENDING', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_PART', 'In Progress'].includes(t.status)
      ).length;
      const resolved = tickets.filter((t) =>
        ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(t.status)
      ).length;
      const totalActive = assigned + inProgress;

      return {
        id: eng._id,
        name: eng.name,
        email: eng.email,
        phone: eng.mobileNumber || eng.phone || '',
        department: formatEngineerRole(eng),
        assigned,
        inProgress,
        resolved,
        totalActive,
      };
    });

    return {
      kpis: {
        newTicketsCount,
        totalOpenCount,
        assignedCount,
        inProgressCount,
        waitingCustomerCount,
        waitingPartCount,
        resolvedCount,
        closedCount,
        overdueCount,
        upcomingCount,
        unassignedCount,
        myTicketsCount,
      },
      unprocessedNewTickets,
      recentTickets,
      upcomingFollowUps,
      overdueTickets,
      engineerWorkload,
    };
  }

  async checkDuplicate({ phone, serialNumber }) {
    const conditions = [];
    if (phone && String(phone).trim().length >= 7) {
      conditions.push({ contactNumber: String(phone).trim() });
    }
    if (serialNumber && String(serialNumber).trim().length >= 3) {
      conditions.push({ productSerialNumber: String(serialNumber).trim() });
    }

    if (!conditions.length) {
      return { isDuplicate: false, message: null, existingTickets: [] };
    }

    const existingTickets = await complaintRepository.find({
      filter: {
        $or: conditions,
        status: { $nin: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'] },
      },
      limit: 5,
      select: 'ticketNo customerName contactNumber productSerialNumber status createdAt',
    });

    if (existingTickets.length > 0) {
      const ticketNos = existingTickets.map((t) => t.ticketNo).join(', ');
      return {
        isDuplicate: true,
        message: `Active complaint found for this customer or equipment (${ticketNos}). Previous tickets are still open.`,
        existingTickets,
      };
    }

    return { isDuplicate: false, message: null, existingTickets: [] };
  }

  async getAssignees() {
    const permDocs = await Permission.find({ complaints: true }).select('user');
    const allowedUserIds = permDocs.map((p) => p.user);

    const filter = {
      status: 'active',
      isDeleted: { $ne: true },
      role: ROLES.USER,
      jobRole: { $ne: JOB_ROLES.SALESPERSON },
    };
    if (allowedUserIds.length > 0) {
      filter._id = { $in: allowedUserIds };
    }

    const users = await User.find(filter)
      .select('name email mobileNumber role adminType jobRole')
      .sort({ name: 1 });

    function formatRole(u) {
      const name = u.name || '';
      if (u.adminType === 'COMPLAINT_COORDINATOR') return 'Complaint Coordinator';
      if (name.includes('Railway S&T')) return 'Railway S&T Specialist';
      if (name.includes('Field Service')) return 'Field Service Specialist';
      if (name.includes('Commissioning Lead')) return 'Commissioning Lead';
      if (name.includes('Installation Spec.')) return 'Field Installation Specialist';
      if (name.includes('Field Support')) return 'Field Technical Support';
      return 'Field Engineer';
    }

    return users.map((u) => ({
      _id: u._id,
      id: u._id,
      name: u.name,
      email: u.email,
      phone: u.mobileNumber,
      role: u.role,
      jobRole: formatRole(u),
    }));
  }

  async createPublic(data, files = []) {
    let photos = [];
    if (files && files.length) {
      try {
        if (env.cloudinary?.cloudName && env.cloudinary?.apiKey && env.cloudinary?.apiSecret) {
          photos = await Promise.all(
            files.map((file) => uploadService.uploadImageBuffer(file.buffer))
          );
        }
      } catch (uploadErr) {
        console.warn('[ComplaintService] Photo upload skipped:', uploadErr.message);
      }
    }

    const customerName = String(data.customerName || '').trim();
    const contactNumber = String(data.contactNumber || data.customerPhone || '').trim();
    const whatsappNumber = String(
      data.whatsappNumber || data.whatsappMobile || contactNumber || ''
    ).trim();
    const description = String(data.description || '').trim();

    if (!customerName || !contactNumber || !whatsappNumber || !description) {
      throw new ApiError(
        400,
        'Customer name, phone number, WhatsApp number, and description are required.'
      );
    }

    // Evaluate warranty
    let warrantyStatus = 'UNKNOWN';
    if (data.productSerialNumber) {
      const calc = calculateWarrantyStatus(data.dispatchDate, data.warrantyEndDate, data.warrantyMonths || 24);
      warrantyStatus = calc.status;
    }

    const ticketNo = await generateTicketId();
    const priority = String(data.priority || 'MEDIUM').toUpperCase();
    const now = new Date();

    const complaint = await complaintRepository.create({
      ticketNo,
      source: 'SELF_SERVICE',
      customerName,
      contactNumber,
      whatsappNumber,
      email: String(data.email || data.customerEmail || '').trim().toLowerCase(),
      companyName: String(data.companyName || data.customerOrganization || '').trim(),
      customerOrganization: String(data.customerOrganization || data.companyName || '').trim(),
      siteName: String(data.siteName || '').trim(),
      location: String(data.location || data.customerLocation || '').trim(),
      customerLocation: String(data.customerLocation || data.location || '').trim(),
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
      priority,
      subject: String(data.subject || description.slice(0, 60)).trim(),
      description,
      customerReportedIssue: String(data.customerReportedIssue || description).trim(),
      dateIssueStarted: data.dateIssueStarted ? new Date(data.dateIssueStarted) : now,
      photos,
      status: 'NEW',
      isAcknowledged: false,
      notifyChannel: 'whatsapp',
      dueAt: dueAtFor(priority, now),
      activityLogs: [
        {
          actorName: customerName,
          action: 'CREATED',
          description: `Self-service complaint submitted by ${customerName}. Ticket assigned ID ${ticketNo}. Initial status: NEW`,
          newValue: `Status: NEW, Priority: ${priority}`,
          timestamp: now,
        },
      ],
    });

    await notifyTicketCreated(complaint);
    if (complaint.emailLogs?.length) await complaint.save();

    return complaint;
  }

  async createInternal(data, currentUser) {
    const customerName = String(data.customerName || '').trim();
    const contactNumber = String(data.contactNumber || data.customerPhone || '').trim();
    const whatsappNumber = String(
      data.whatsappNumber || data.whatsappMobile || contactNumber || ''
    ).trim();
    const description = String(data.description || '').trim();

    if (!customerName || !contactNumber || !whatsappNumber || !description) {
      throw new ApiError(
        400,
        'Customer name, mobile number, WhatsApp number, and complaint description are required.'
      );
    }

    // Resolve or link Customer record, or auto-create Customer so it is stored and available in autocomplete next time
    let customerId = data.customerId || null;
    const companyOrg = String(data.customerOrganization || data.companyName || '').trim();
    const phoneDigits = contactNumber.replace(/\D/g, '');

    if (!customerId) {
      const orLookups = [];
      if (contactNumber) orLookups.push({ phone: contactNumber });
      if (phoneDigits) orLookups.push({ phoneNormalized: phoneDigits });
      if (companyOrg) {
        orLookups.push(
          { normalizedCompanyName: companyOrg.toLowerCase() },
          { companyName: new RegExp(`^${escapeRegex(companyOrg)}$`, 'i') }
        );
      }

      if (orLookups.length > 0) {
        const existing = await Customer.findOne({ $or: orLookups });
        if (existing) {
          customerId = existing._id;
        }
      }

      // If still not found and company or customer name provided, auto-create customer record
      if (!customerId && (companyOrg || customerName)) {
        try {
          const finalCompanyName = companyOrg || customerName;
          const newCust = await Customer.create({
            companyName: finalCompanyName,
            normalizedCompanyName: finalCompanyName.toLowerCase(),
            contactPerson: customerName !== finalCompanyName ? customerName : '',
            phone: contactNumber,
            phoneNormalized: phoneDigits,
            email: String(data.email || '').trim().toLowerCase(),
            address: String(data.customerLocation || data.location || '').trim(),
            city: String(data.customerLocation || data.location || '').trim(),
            active: true,
            createdBy: currentUser ? currentUser._id : null,
          });
          customerId = newCust._id;
        } catch (err) {
          console.warn('[ComplaintService] Could not auto-create Customer:', err.message);
        }
      }
    }

    // Calculate warranty status
    let warrantyStatus = 'UNKNOWN';
    if (data.productSerialNumber || data.dispatchDate) {
      const calc = calculateWarrantyStatus(
        data.dispatchDate,
        data.warrantyEndDate,
        data.warrantyMonths || 24
      );
      warrantyStatus = calc.status;
    }

    const ticketNo = await generateTicketId();
    const priority = String(data.priority || 'MEDIUM').toUpperCase();
    const now = new Date();

    const isStaffUser = currentUser?.role === ROLES.USER;
    let assignedTo = isStaffUser
      ? currentUser._id
      : data.assignedTo || data.assignedEngineerId || null;
    if (!isStaffUser && assignedTo) {
      const engUser = await User.findById(assignedTo);
      if (!engUser || !isAssignableEngineer(engUser)) {
        throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
      }
    }
    const initialStatus = assignedTo ? 'ASSIGNED' : 'NEW';

    const complaintData = {
      ticketNo,
      source: data.source || 'PHONE',
      customerId,
      customerName,
      contactNumber,
      whatsappNumber,
      email: String(data.email || data.customerEmail || '').trim().toLowerCase(),
      companyName: String(data.companyName || data.customerOrganization || '').trim(),
      customerOrganization: String(data.customerOrganization || data.companyName || '').trim(),
      siteName: String(data.siteName || data.stationName || data.customerLocation || '').trim(),
      location: String(data.location || data.customerLocation || data.siteName || data.stationName || '').trim(),
      customerLocation: String(data.customerLocation || data.siteName || data.stationName || data.location || '').trim(),
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
      priority,
      subject: String(data.subject || data.problem || description.slice(0, 60)).trim(),
      description,
      customerReportedIssue: String(data.customerReportedIssue || data.problem || description).trim(),
      dateIssueStarted: data.complaintDate || data.dateIssueStarted ? new Date(data.complaintDate || data.dateIssueStarted) : now,
      status: initialStatus,
      isAcknowledged: Boolean(assignedTo),
      acknowledgedAt: assignedTo ? now : null,
      pendingRemark: String(data.pendingRemark || data.pendingReason || '').trim(),
      pendingRemarkAt: data.pendingRemark || data.pendingReason ? now : null,
      pendingRemarkBy: data.pendingRemark || data.pendingReason ? (currentUser?.name || '') : '',
      complaintReceiverName: String(data.complaintReceiverName || currentUser?.name || '').trim(),
      solutions: String(data.solutions || '').trim(),
      takenTime: String(data.takenTime || '').trim(),
      attempt: Math.max(1, Number(data.attempt) || 1),
      deliveryStatus: String(data.deliveryStatus || '').trim(),
      notifyChannel: 'whatsapp',
      assignedTo,
      assignedAt: assignedTo ? now : null,
      complaintHandlerId: currentUser ? currentUser._id : null,
      createdBy: currentUser ? currentUser._id : null,
      dueAt: dueAtFor(priority, now),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      activityLogs: [
        {
          actor: currentUser ? currentUser._id : null,
          actorName: currentUser ? currentUser.name : 'Intake Desk',
          action: 'CREATED',
          description: `Internal phone complaint registered by ${currentUser ? currentUser.name : 'Staff'}. Ticket ${ticketNo} created.`,
          newValue: `Status: ${initialStatus}, Priority: ${priority}`,
          timestamp: now,
        },
      ],
    };

    if (assignedTo) {
      complaintData.assignmentHistory = [
        {
          fromEngineer: null,
          fromEngineerName: 'Unassigned',
          toEngineer: assignedTo,
          toEngineerName: isStaffUser ? currentUser.name : data.assignedEngineerName || 'Engineer',
          assignedBy: currentUser ? currentUser._id : null,
          assignedByName: currentUser ? currentUser.name : 'Staff',
          reason: 'Initial assignment during intake',
          timestamp: now,
        },
      ];
    }

    const complaint = await complaintRepository.create(complaintData);
    await notifyTicketCreated(complaint);
    if (assignedTo) {
      try {
        const engName = isStaffUser
          ? currentUser.name
          : data.assignedEngineerName || (await User.findById(assignedTo))?.name || 'Engineer';
        const assignLogs = await notifyCustomerTicketAssigned(
          complaint,
          engName,
          complaint.notifyChannel
        );
        if (assignLogs?.length) complaint.emailLogs.push(...assignLogs);
      } catch (err) {
        console.warn('[ComplaintService] Intake assign notify error:', err.message);
      }
    }
    if (complaint.emailLogs?.length) await complaint.save();
    return complaint;
  }

  async acknowledge(id, currentUser) {
    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    if (complaint.isAcknowledged) {
      return complaint;
    }

    const now = new Date();
    complaint.isAcknowledged = true;
    complaint.acknowledgedAt = now;

    if (complaint.status === 'NEW' || complaint.status === 'Open') {
      const fromStatus = complaint.status;
      complaint.status = 'ACKNOWLEDGED';
      complaint.statusHistory.push({
        fromStatus,
        toStatus: 'ACKNOWLEDGED',
        changedBy: currentUser ? currentUser._id : null,
        changedByName: currentUser ? currentUser.name : 'Staff',
        reason: 'Ticket reviewed and acknowledged by complaint handler',
        timestamp: now,
      });
    }

    complaint.activityLogs.push({
      actor: currentUser ? currentUser._id : null,
      actorName: currentUser ? currentUser.name : 'Staff',
      action: 'ACKNOWLEDGED',
      description: 'Reviewed and acknowledged complaint',
      oldValue: 'Status: NEW (Unprocessed)',
      newValue: 'Status: ACKNOWLEDGED',
      timestamp: now,
    });

    return complaint.save();
  }

  async assign(id, { engineerId, reason }, currentUser) {
    if (currentUser?.role !== ROLES.ADMIN) {
      throw new ApiError(403, 'Only an Admin can change ticket assignment');
    }
    if (!engineerId) throw new ApiError(400, 'Engineer ID is required.');

    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    const engineer = await User.findById(engineerId);
    if (!engineer) throw new ApiError(404, 'Selected engineer was not found.');
    if (!isAssignableEngineer(engineer)) {
      throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
    }

    const now = new Date();
    const previousEngineerId = complaint.assignedTo ? String(complaint.assignedTo._id || complaint.assignedTo) : null;
    const previousEngineerName = complaint.assignedTo?.name || 'Unassigned';
    const isReassignment = Boolean(previousEngineerId && previousEngineerId !== String(engineerId));

    // Save historical assignment entry
    complaint.assignmentHistory.push({
      fromEngineer: previousEngineerId,
      fromEngineerName: previousEngineerName,
      toEngineer: engineer._id,
      toEngineerName: engineer.name,
      assignedBy: currentUser ? currentUser._id : null,
      assignedByName: currentUser ? currentUser.name : 'Staff',
      reason: reason || (isReassignment ? 'Reassigned to specialist' : 'Initial assignment'),
      timestamp: now,
    });

    // Auto-update status if it was NEW or ACKNOWLEDGED
    if (['NEW', 'ACKNOWLEDGED', 'Open'].includes(complaint.status)) {
      complaint.statusHistory.push({
        fromStatus: complaint.status,
        toStatus: 'ASSIGNED',
        changedBy: currentUser ? currentUser._id : null,
        changedByName: currentUser ? currentUser.name : 'Staff',
        reason: `Assigned to ${engineer.name}`,
        timestamp: now,
      });
      complaint.status = 'ASSIGNED';
    }

    complaint.assignedTo = engineer._id;
    complaint.assignedAt = now;
    complaint.isAcknowledged = true;

    complaint.activityLogs.push({
      actor: currentUser ? currentUser._id : null,
      actorName: currentUser ? currentUser.name : 'Staff',
      action: isReassignment ? 'REASSIGNED' : 'ASSIGNED',
      description: isReassignment
        ? `Reassigned engineer from ${previousEngineerName} to ${engineer.name}. Reason: ${reason || 'Not specified'}`
        : `Assigned ticket to ${engineer.name}`,
      oldValue: previousEngineerName,
      newValue: engineer.name,
      timestamp: now,
    });

    // Customer WhatsApp/SMS when assigned — uses AISensy assign template when you configure it
    try {
      const assignLogs = await notifyCustomerTicketAssigned(
        complaint,
        engineer.name,
        complaint.notifyChannel
      );
      if (assignLogs?.length) complaint.emailLogs.push(...assignLogs);
    } catch (err) {
      console.warn('[ComplaintService] Assign notify error:', err.message);
    }

    return complaint.save();
  }

  async updateStatus(id, { nextStatus, reason }, currentUser) {
    if (!nextStatus) throw new ApiError(400, 'Next status is required.');

    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    const check = canTransitionStatus(
      complaint.status,
      nextStatus,
      currentUser?.role,
      currentUser?.adminType
    );
    if (!check.allowed) {
      throw new ApiError(400, check.reason);
    }

    const now = new Date();
    if (nextStatus === 'PENDING') {
      applyPendingRemark(complaint, reason, currentUser, now);
    }
    const fromStatus = complaint.status;
    complaint.status = nextStatus;
    complaint.isAcknowledged = true;

    if (nextStatus === 'CLOSED') {
      complaint.closedAt = now;
      complaint.closedBy = currentUser ? currentUser._id : null;
    }

    complaint.statusHistory.push({
      fromStatus,
      toStatus: nextStatus,
      changedBy: currentUser ? currentUser._id : null,
      changedByName: currentUser ? currentUser.name : 'Staff',
      reason: reason || `Status updated to ${nextStatus}`,
      timestamp: now,
    });

    complaint.activityLogs.push({
      actor: currentUser ? currentUser._id : null,
      actorName: currentUser ? currentUser.name : 'Staff',
      action: 'STATUS_CHANGED',
      description: `Transitioned status from ${fromStatus} to ${nextStatus}${reason ? `. Reason: ${reason}` : ''}`,
      oldValue: fromStatus,
      newValue: nextStatus,
      timestamp: now,
    });

    return complaint.save();
  }

  async addWorkLog(id, workLogData, currentUser) {
    const { workPerformed } = workLogData;
    if (!workPerformed || !workPerformed.trim()) {
      throw new ApiError(400, 'Work performed details are mandatory.');
    }

    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    const now = new Date();
    const engineerId = currentUser ? currentUser._id : null;
    const engineerName = currentUser ? currentUser.name : 'Engineer';

    complaint.workLogs.push({
      engineer: engineerId,
      engineerName,
      workDate: workLogData.workDate ? new Date(workLogData.workDate) : now,
      workPerformed: workPerformed.trim(),
      findings: workLogData.findings ? workLogData.findings.trim() : '',
      actionTaken: workLogData.actionTaken ? workLogData.actionTaken.trim() : '',
      partsUsed: workLogData.partsUsed ? workLogData.partsUsed.trim() : '',
      testPerformed: workLogData.testPerformed ? workLogData.testPerformed.trim() : '',
      testResult: workLogData.testResult ? workLogData.testResult.trim() : '',
      nextAction: workLogData.nextAction ? workLogData.nextAction.trim() : '',
      followUpDate: workLogData.followUpDate ? new Date(workLogData.followUpDate) : null,
      remarks: workLogData.remarks ? workLogData.remarks.trim() : '',
      loggedAt: now,
    });

    if (workLogData.followUpDate) {
      complaint.followUpDate = new Date(workLogData.followUpDate);
    }

    // Auto-update status to IN_PROGRESS if currently ASSIGNED
    if (complaint.status === 'ASSIGNED' || complaint.status === 'Open') {
      complaint.status = 'IN_PROGRESS';
      complaint.statusHistory.push({
        fromStatus: 'ASSIGNED',
        toStatus: 'IN_PROGRESS',
        changedBy: engineerId,
        changedByName: engineerName,
        reason: 'Work started on site / investigation work log recorded',
        timestamp: now,
      });
    }

    complaint.activityLogs.push({
      actor: engineerId,
      actorName: engineerName,
      action: 'WORK_LOG_ADDED',
      description: `Investigation work log recorded by ${engineerName}. Action: ${workLogData.actionTaken || workPerformed.slice(0, 80)}`,
      newValue: workPerformed.slice(0, 100),
      timestamp: now,
    });

    return complaint.save();
  }

  async resolve(id, resolutionData, currentUser) {
    const { resolutionReason, resolutionActionTaken, resolutionSummary } = resolutionData;
    if (!resolutionReason || !resolutionActionTaken || !resolutionSummary) {
      throw new ApiError(
        400,
        'Mandatory resolution fields missing: Root cause, action taken, and resolution summary are all required.'
      );
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

    await notifyTicketResolved(complaint);

    return complaint.save();
  }

  async reopen(id, { reason, reassignToEngineerId }, currentUser) {
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Reason for reopening the ticket is mandatory.');
    }

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

    if (reassignToEngineerId) {
      const engUser = await User.findById(reassignToEngineerId);
      if (!engUser || !isAssignableEngineer(engUser)) {
        throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
      }
      complaint.assignedTo = reassignToEngineerId;
      complaint.assignedAt = now;
    }

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

    return complaint.save();
  }

  async addComment(id, { content, visibility = 'INTERNAL' }, currentUser) {
    if (!content || !content.trim()) {
      throw new ApiError(400, 'Note text cannot be empty.');
    }

    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    const validVisibility = visibility === 'CUSTOMER_VISIBLE' ? 'CUSTOMER_VISIBLE' : 'INTERNAL';
    const now = new Date();
    const authorId = currentUser ? currentUser._id : null;
    const authorName = currentUser ? currentUser.name : 'Staff';

    complaint.comments.push({
      author: authorId,
      authorName,
      authorRole: currentUser ? currentUser.role : 'Staff',
      content: content.trim(),
      visibility: validVisibility,
      createdAt: now,
    });

    complaint.activityLogs.push({
      actor: authorId,
      actorName,
      action: 'NOTE_ADDED',
      description: `Added ${validVisibility === 'CUSTOMER_VISIBLE' ? 'Customer-Visible Update' : 'Internal Note'}`,
      newValue: content.slice(0, 100),
      timestamp: now,
    });

    return complaint.save();
  }

  async update(id, data, currentUser) {
    const complaint = await complaintRepository.findByTicketOrId(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');

    const now = new Date();
    const changes = [];

    const assignField = (key, label) => {
      if (data[key] !== undefined && data[key] !== complaint[key]) {
        changes.push(`${label}: "${complaint[key] || 'None'}" -> "${data[key]}"`);
        complaint[key] = data[key];
      }
    };

    assignField('customerName', 'Customer Name');
    assignField('contactNumber', 'Phone Number');
    assignField('whatsappNumber', 'WhatsApp Number');
    assignField('email', 'Email');
    assignField('companyName', 'Organization');
    assignField('customerOrganization', 'Organization');
    assignField('siteName', 'Site Name');
    assignField('location', 'Location');
    assignField('customerLocation', 'Customer Location');
    assignField('product', 'Product');
    assignField('productName', 'Product Name');
    assignField('productModel', 'Product Model');
    assignField('category', 'Category');
    assignField('subject', 'Subject');
    assignField('description', 'Description');

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

    if (data.assignedTo !== undefined) {
      if (currentUser?.role !== ROLES.ADMIN) {
        throw new ApiError(403, 'Only an Admin can change ticket assignment');
      }
      const newEngId = data.assignedTo || null;
      if (String(newEngId || '') !== String(complaint.assignedTo || '')) {
        let engName = 'Unassigned';
        if (newEngId) {
          const engUser = await User.findById(newEngId);
          if (!engUser || !isAssignableEngineer(engUser)) {
            throw new ApiError(400, 'Tickets can only be assigned to field engineers.');
          }
          engName = engUser.name;
        }
        changes.push(`Assigned Engineer: ${engName}`);
        complaint.assignedTo = newEngId;
        complaint.assignedAt = newEngId ? now : null;
        if (newEngId && (!complaint.status || complaint.status === 'NEW')) {
          complaint.status = 'ASSIGNED';
          changes.push('Status: ASSIGNED');
        }
      }
    }

    if (data.status !== undefined && data.status !== complaint.status) {
      const check = canTransitionStatus(
        complaint.status,
        data.status,
        currentUser?.role,
        currentUser?.adminType
      );
      if (!check.allowed) throw new ApiError(400, check.reason);
      if (data.status === 'PENDING') {
        applyPendingRemark(complaint, data.pendingRemark || data.note, currentUser, now);
      }
      const fromStatus = complaint.status;
      changes.push(`Status: "${fromStatus}" -> "${data.status}"`);
      complaint.status = data.status;
      if (['RESOLVED', 'Resolved'].includes(data.status)) {
        complaint.resolvedAt = now;
        await notifyTicketResolved(complaint);
      }
      if (['CLOSED', 'Closed'].includes(data.status)) {
        complaint.closedAt = now;
      }
      complaint.statusHistory.push({
        fromStatus,
        toStatus: data.status,
        changedBy: currentUser ? currentUser._id : null,
        changedByName: currentUser ? currentUser.name : 'Staff',
        reason: data.pendingRemark || data.note || `Status updated to ${data.status}`,
        timestamp: now,
      });
    }

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

  async publicTrack({ ticketNumber, verification }) {
    if (!ticketNumber || !ticketNumber.trim()) {
      throw new ApiError(400, 'Ticket number is required.');
    }

    const clean = ticketNumber.trim().toUpperCase();
    const complaint = await complaintRepository.model
      .findOne({
        $or: [{ ticketNo: clean }, { ticketNo: new RegExp(escapeRegex(clean), 'i') }],
      })
      .populate('assignedTo', 'name department jobRole');

    if (!complaint) {
      throw new ApiError(404, 'No service complaint found matching the provided Ticket ID.');
    }

    // Verification check if user provided phone or email
    if (verification && String(verification).trim().length > 0) {
      const cleanVerify = String(verification).trim().toLowerCase();
      const phoneMatch = complaint.contactNumber.includes(cleanVerify);
      const emailMatch = complaint.email && complaint.email.toLowerCase().includes(cleanVerify);

      if (!phoneMatch && !emailMatch) {
        throw new ApiError(403, 'Verification does not match the customer details on record.');
      }
    }

    // STRICT CUSTOMER PRIVACY:
    // Only customer-visible notes
    // Masked customer phone
    // Internal user details / staff contacts hidden
    const publicUpdates = (complaint.comments || [])
      .filter((c) => c.visibility === 'CUSTOMER_VISIBLE')
      .map((c) => ({
        id: c._id,
        authorName: c.authorName || 'Service Desk',
        content: c.content,
        createdAt: c.createdAt,
      }));

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
      assignedEngineer: complaint.assignedTo
        ? {
            name: complaint.assignedTo.name,
            department: complaint.assignedTo.department || complaint.assignedTo.jobRole || 'Field Service',
            assignedAt:
              complaint.assignedAt ||
              complaint.assignmentHistory?.[complaint.assignmentHistory.length - 1]?.timestamp ||
              null,
          }
        : null,
      publicUpdates,
      isResolved: ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(complaint.status),
      resolutionSummary: complaint.resolutionSummary || complaint.resolutionNotes || null,
      resolutionDate: complaint.resolvedAt,
    };
  }
}

module.exports = new ComplaintService();
