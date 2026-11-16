const visitRepository = require('../repositories/visit.repository');
const visitApprovalRepository = require('../repositories/visitApproval.repository');
const dailyVisitDayRepository = require('../repositories/dailyVisitDay.repository');
const visitExpenseRepository = require('../repositories/visitExpense.repository');
const customerRepository = require('../repositories/customer.repository');
const attendanceRepository = require('../repositories/attendance.repository');
const userRepository = require('../repositories/user.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { haversineMeters, withinRadius, toCoord } = require('../utils/geo');
const { travelKmBetween } = require('../utils/travelKm');
const {
  assertTransition,
  assertMissedReason,
  isOpenVisitStatus,
  isVisitResolvedForDay,
} = require('../utils/visitStatus');
const { isSalesperson } = require('../utils/roles');
const { kolkataToday } = require('../utils/kolkataDate');
const env = require('../config/env');
const {
  ROLES,
  USER_STATUS,
  JOB_ROLES,
  VISIT_STATUS,
  VISIT_TYPE,
  DAY_VISIT_STATUS,
  VISIT_EXPENSE_STATUS,
  TRANSPORT_MODE,
  PRIVATE_KM_RATE,
  VISIT_APPROVAL_DECISION,
  VISIT_EXCEPTION_KIND,
} = require('../config/constants');

const ALLOWED_SORT_FIELDS = ['visitDate', 'plannedTime', 'status', 'createdAt'];
const VISIT_POPULATE = [
  { path: 'salesperson', select: 'name email mobileNumber jobRole' },
  { path: 'customer', select: 'companyName city state address locationLat locationLng assignedSalesperson' },
  { path: 'createdBy', select: 'name email' },
];
const APPROVAL_POPULATE = [
  {
    path: 'visit',
    populate: [
      { path: 'salesperson', select: 'name email' },
      { path: 'customer', select: 'companyName city address' },
    ],
  },
  { path: 'requestedBy', select: 'name email' },
  { path: 'reviewedBy', select: 'name email' },
];

const { coveringDateFilter, decorate, list } = require('./visit.listAndtodayPlanAndgetByIdAndgeofenceMeters');

async function reviewApproval(id, data, actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Admin only');
  const decision = String(data.decision || '').toUpperCase();
  if (decision !== VISIT_APPROVAL_DECISION.APPROVED && decision !== VISIT_APPROVAL_DECISION.REJECTED) {
    throw new ApiError(400, 'Decision must be APPROVED or REJECTED');
  }
  const rejectionReason = String(data.rejectionReason || '').trim();
  if (decision === VISIT_APPROVAL_DECISION.REJECTED && !rejectionReason) {
    throw new ApiError(400, 'Rejection reason is required');
  }

  const approval = await visitApprovalRepository.findById(id);
  if (!approval) throw new ApiError(404, 'Approval request not found');
  if (approval.decision !== VISIT_APPROVAL_DECISION.PENDING) {
    throw new ApiError(400, 'This request has already been reviewed');
  }

  const visit = await visitRepository.findById(approval.visit);
  if (!visit) throw new ApiError(404, 'Visit not found');

  let nextStatus;
  if (decision === VISIT_APPROVAL_DECISION.APPROVED) {
    if (approval.kind === VISIT_EXCEPTION_KIND.OUT_OF_RANGE) {
      nextStatus = visit.checkOutAt ? VISIT_STATUS.COMPLETED : VISIT_STATUS.IN_PROGRESS;
    } else {
      nextStatus = VISIT_STATUS.APPROVED_MISSED;
    }
  } else {
    nextStatus = VISIT_STATUS.REJECTED;
  }

  assertTransition(visit.status, nextStatus);

  await visitApprovalRepository.updateById(approval._id, {
    decision,
    reviewedBy: actor._id,
    reviewedAt: new Date(),
    rejectionReason: decision === VISIT_APPROVAL_DECISION.REJECTED ? rejectionReason : '',
  });
  await visitRepository.updateById(visit._id, { status: nextStatus });
  return visitApprovalRepository.findById(approval._id, { populate: APPROVAL_POPULATE });
}

async function unfinishedForDay(salespersonId, visitDate) {
  const items = await visitRepository.find({
    salesperson: salespersonId,
    ...coveringDateFilter(visitDate),
    status: { $in: [VISIT_STATUS.PLANNED, VISIT_STATUS.IN_PROGRESS, VISIT_STATUS.PENDING_APPROVAL, VISIT_STATUS.REJECTED] },
  });
  return items.filter((v) => isOpenVisitStatus(v.status));
}

async function orderedDayVisits(salespersonId, date, visitIds) {
  const filter = { salesperson: salespersonId, ...coveringDateFilter(date) };
  if (visitIds?.length) filter._id = { $in: visitIds };
  return visitRepository.find(filter, { sort: { plannedTime: 1, createdAt: 1 }, populate: VISIT_POPULATE });
}

async function assertSequentialStart(visit, actor) {
  const date = kolkataToday();
  const day = await dailyVisitDayRepository.findOne({ salesperson: actor._id, date });
  let queue = [];
  if (day?.visitIds?.length) {
    if (!day.visitIds.map(String).includes(String(visit._id))) {
      throw new ApiError(400, "This visit is not in today's selected list");
    }
    queue = await orderedDayVisits(actor._id, date, day.visitIds);
  } else {
    queue = await orderedDayVisits(actor._id, date);
    if (queue.length > 1) {
      throw new ApiError(400, "Select today's visits on Visit Plan before checking in");
    }
  }
  const inProgress = queue.find(
    (row) =>
      !isVisitResolvedForDay(row) &&
      (row.status === VISIT_STATUS.IN_PROGRESS ||
        (row.status === VISIT_STATUS.PENDING_APPROVAL && row.checkInAt && !row.checkOutAt))
  );
  if (inProgress && String(inProgress._id) !== String(visit._id)) {
    throw new ApiError(400, 'Finish the in-progress visit first');
  }
  const next = queue.find((row) => !isVisitResolvedForDay(row));
  if (next && String(next._id) !== String(visit._id)) {
    throw new ApiError(400, 'Complete visits in order');
  }
}

async function previousTravelPoint(actor, visit) {
  const done = await visitRepository.find(
    {
      salesperson: actor._id,
      checkOutAt: { $ne: null },
      _id: { $ne: visit._id },
    },
    { sort: { checkOutAt: -1 } }
  );
  const prev = done[0];
  if (prev?.checkOutLat != null && prev?.checkOutLng != null) {
    return { lat: prev.checkOutLat, lng: prev.checkOutLng };
  }
  const att = await attendanceRepository.findToday(actor._id, kolkataToday());
  if (att?.punchInLat != null && att?.punchInLng != null) {
    return { lat: att.punchInLat, lng: att.punchInLng };
  }
  if (visit.checkInLat != null && visit.checkInLng != null) {
    return { lat: visit.checkInLat, lng: visit.checkInLng };
  }
  return null;
}

function decorateDay(day, visits, expense) {
  const selected = day?.visitIds?.length
    ? day.visitIds.map((id) => visits.find((v) => String(v._id) === String(id))).filter(Boolean)
    : [];
  const completed = selected.filter((v) => isVisitResolvedForDay(v)).length;
  const totalKm = selected.reduce((sum, v) => sum + (Number(v.travelKm) || 0), 0);
  return {
    date: day?.date || kolkataToday(),
    status: day?.status || DAY_VISIT_STATUS.DRAFT,
    submittedAt: day?.submittedAt || null,
    planned: visits.map((v) => decorate(v)),
    selected: selected.map((v) => decorate(v)),
    completed,
    remaining: Math.max(0, selected.length - completed),
    totalKm: Math.round(totalKm * 10) / 10,
    canSubmit: Boolean(day) && selected.length > 0 && completed === selected.length && day.status !== DAY_VISIT_STATUS.SUBMITTED,
    expense: expense || null,
  };
}

async function getDay(query, actor) {
  if (!isSalesperson(actor) && actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Not allowed');
  const date = String(query.date || kolkataToday());
  const salespersonId = actor.role === ROLES.ADMIN && query.salesperson ? query.salesperson : actor._id;
  if (actor.role !== ROLES.ADMIN) assertOwnDay(salespersonId, actor);
  const [planned, day, expense] = await Promise.all([
    orderedDayVisits(salespersonId, date),
    dailyVisitDayRepository.findOne({ salesperson: salespersonId, date }),
    visitExpenseRepository.findOne({ salesperson: salespersonId, date }, { populate: EXPENSE_POPULATE }),
  ]);
  return decorateDay(day, planned, expense);
}

function assertOwnDay(salespersonId, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (String(salespersonId) !== String(actor._id)) throw new ApiError(403, 'You can only access your own day');
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  reviewApproval,
  unfinishedForDay,
  orderedDayVisits,
  assertSequentialStart,
  previousTravelPoint,
  decorateDay,
  getDay,
  assertOwnDay,
};
