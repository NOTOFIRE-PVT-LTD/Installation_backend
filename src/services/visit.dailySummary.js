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

const { decorate } = require('./visit.listAndtodayPlanAndgetByIdAndgeofenceMeters');

async function dailySummary(query, actor) {
  let salespersonId = actor._id;
  if (actor.role === ROLES.ADMIN && query.salesperson) {
    salespersonId = query.salesperson;
  }

  const visitFilter = { salesperson: salespersonId };
  if (query.startDate && query.endDate) {
    visitFilter.visitDate = { $gte: String(query.startDate), $lte: String(query.endDate) };
  } else if (query.startDate) {
    visitFilter.visitDate = { $gte: String(query.startDate) };
  } else if (query.endDate) {
    visitFilter.visitDate = { $lte: String(query.endDate) };
  }

  const visits = await visitRepository.find(visitFilter, {
    sort: { visitDate: -1, plannedTime: 1, createdAt: 1 },
    populate: VISIT_POPULATE,
  });

  const expenseFilter = { salesperson: salespersonId };
  if (query.startDate && query.endDate) {
    expenseFilter.date = { $gte: String(query.startDate), $lte: String(query.endDate) };
  } else if (query.startDate) {
    expenseFilter.date = { $gte: String(query.startDate) };
  } else if (query.endDate) {
    expenseFilter.date = { $lte: String(query.endDate) };
  }

  const expenses = await visitExpenseRepository.find(expenseFilter, {
    populate: EXPENSE_POPULATE,
    sort: { date: -1 },
  });
  const expenseByDate = new Map();
  for (const exp of expenses) {
    expenseByDate.set(exp.date, exp);
  }

  const dayFilter = { salesperson: salespersonId };
  if (query.startDate && query.endDate) {
    dayFilter.date = { $gte: String(query.startDate), $lte: String(query.endDate) };
  }
  const dayRecords = await dailyVisitDayRepository.find(dayFilter);
  const dayByDate = new Map();
  for (const d of dayRecords) {
    dayByDate.set(d.date, d);
  }

  // Group visits by date
  const groups = new Map();
  for (const v of visits) {
    const d = v.visitDate || 'Unknown Date';
    if (!groups.has(d)) {
      groups.set(d, []);
    }
    groups.get(d).push(decorate(v));
  }

  // Include dates that have an expense even if no visits recorded
  for (const exp of expenses) {
    if (!groups.has(exp.date)) {
      groups.set(exp.date, []);
    }
  }

  const dates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  return dates.map((date) => {
    const dateVisits = groups.get(date) || [];
    const exp = expenseByDate.get(date) || null;
    const day = dayByDate.get(date) || null;

    const completed = dateVisits.filter((v) => isVisitResolvedForDay(v) && v.checkOutAt).length;
    const missed = dateVisits.filter(
      (v) =>
        v.status === VISIT_STATUS.APPROVED_MISSED ||
        (isVisitResolvedForDay(v) && !v.checkOutAt)
    ).length;
    const inProgress = dateVisits.filter(
      (v) =>
        !isVisitResolvedForDay(v) &&
        (v.status === VISIT_STATUS.IN_PROGRESS ||
          (v.status === VISIT_STATUS.PENDING_APPROVAL && v.checkInAt && !v.checkOutAt))
    ).length;
    const planned = dateVisits.filter((v) => v.status === VISIT_STATUS.PLANNED).length;

    const totalTravelKm = dateVisits.reduce((sum, v) => sum + (Number(v.travelKm) || 0), 0);

    return {
      date,
      totalVisits: dateVisits.length,
      completedCount: completed,
      missedCount: missed,
      inProgressCount: inProgress,
      plannedCount: planned,
      totalTravelKm: Math.round(totalTravelKm * 10) / 10,
      dayStatus: day?.status || (dateVisits.length ? 'NOT_SUBMITTED' : 'NO_VISITS'),
      submittedAt: day?.submittedAt || null,
      expense: exp
        ? {
            _id: exp._id,
            totalAmount: exp.totalAmount || 0,
            totalKm: exp.totalKm || 0,
            status: exp.status,
            itemCount: exp.items?.length || 0,
            items: exp.items || [],
            adminComment: exp.adminComment || '',
          }
        : null,
      visits: dateVisits,
    };
  });
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  dailySummary,
};
