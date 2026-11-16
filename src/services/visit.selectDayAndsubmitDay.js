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

const { requireTodayPunchIn } = require('./visit.listAndtodayPlanAndgetByIdAndgeofenceMeters');
const { create } = require('./visit.createAndproximityAndcheckIn');
const { getDay, orderedDayVisits } = require('./visit.reviewApprovalAndunfinishedForDayAndgetDay');

async function selectDay(data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can start the day');
  await requireTodayPunchIn(actor);
  const date = kolkataToday();
  const ids = Array.isArray(data.visitIds) ? data.visitIds.map(String) : [];
  if (!ids.length) throw new ApiError(400, 'Select at least one visit');
  const planned = await orderedDayVisits(actor._id, date);
  const allowed = new Set(planned.map((v) => String(v._id)));
  if (ids.some((id) => !allowed.has(id))) throw new ApiError(400, 'One or more visits are not planned for today');
  const existing = await dailyVisitDayRepository.findOne({ salesperson: actor._id, date });
  if (existing?.status === DAY_VISIT_STATUS.SUBMITTED) throw new ApiError(400, 'Today is already submitted');
  const payload = { salesperson: actor._id, date, visitIds: ids, status: DAY_VISIT_STATUS.DRAFT };
  const day = existing
    ? await dailyVisitDayRepository.updateById(existing._id, payload)
    : await dailyVisitDayRepository.create(payload);
  return getDay({ date }, actor);
}

async function submitDay(actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can submit the day');
  const date = kolkataToday();
  const day = await dailyVisitDayRepository.findOne({ salesperson: actor._id, date });
  if (!day?.visitIds?.length) throw new ApiError(400, "Select today's visits first");
  if (day.status === DAY_VISIT_STATUS.SUBMITTED) throw new ApiError(400, 'Today is already submitted');
  const selected = await orderedDayVisits(actor._id, date, day.visitIds);
  const unfinished = selected.filter((v) => !isVisitResolvedForDay(v));
  if (unfinished.length) throw new ApiError(400, 'Complete or report every selected visit before submitting the day');
  await dailyVisitDayRepository.updateById(day._id, { status: DAY_VISIT_STATUS.SUBMITTED, submittedAt: new Date() });
  await ensureDraftExpense(actor._id, date, day, selected);
  return getDay({ date }, actor);
}

async function ensureDraftExpense(salespersonId, date, day, visits) {
  const existing = await visitExpenseRepository.findOne({ salesperson: salespersonId, date });
  if (existing && existing.status !== VISIT_EXPENSE_STATUS.DRAFT) return existing;
  const items = visits.map((v) => {
    const km = Number(v.travelKm) || 0;
    return {
      visit: v._id,
      transportMode: TRANSPORT_MODE.PRIVATE,
      distanceKm: km,
      ratePerKm: PRIVATE_KM_RATE,
      amount: Math.round(km * PRIVATE_KM_RATE),
      fare: 0,
    };
  });
  const totalKm = items.reduce((sum, row) => sum + row.distanceKm, 0);
  const totalAmount = items.reduce((sum, row) => sum + row.amount, 0);
  const payload = {
    salesperson: salespersonId,
    date,
    dailyVisitDay: day._id,
    items,
    totalKm: Math.round(totalKm * 10) / 10,
    totalAmount,
    status: VISIT_EXPENSE_STATUS.DRAFT,
  };
  if (existing) return visitExpenseRepository.updateById(existing._id, payload);
  return visitExpenseRepository.create(payload);
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  selectDay,
  submitDay,
  ensureDraftExpense,
};
