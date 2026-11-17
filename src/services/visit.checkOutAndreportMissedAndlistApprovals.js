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

const { assertOwnVisit, getById, measureAgainstVisit, parseCoords, requireTodayPunchIn, resolveLocation } = require('./visit.listAndtodayPlanAndgetByIdAndgeofenceMeters');
const { create } = require('./visit.createAndproximityAndcheckIn');
const { previousTravelPoint } = require('./visit.reviewApprovalAndunfinishedForDayAndgetDay');

async function checkOut(id, data, file, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can check out');
  await requireTodayPunchIn(actor);
  if (!file?.buffer) throw new ApiError(400, 'Check-out photo is required');

  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  if (!visit.checkInAt) throw new ApiError(400, 'Check in first');

  const { lat, lng } = parseCoords(data.lat, data.lng);
  const location = resolveLocation(visit, visit.customer);
  const proceedAnyway = data.proceedAnyway === true || data.proceedAnyway === 'true';
  let isOutOfRange = false;
  let distanceM = 0;

  if (location.lat != null && location.lng != null) {
    const measured = measureAgainstVisit(visit, visit.customer, lat, lng);
    distanceM = Math.round(measured.distanceM);
    if (!measured.withinGeofence) {
      if (!proceedAnyway && visit.status !== VISIT_STATUS.PENDING_APPROVAL) {
        throw new ApiError(
          400,
          `You are outside the allowed customer location (${distanceM}m away). Move within ${measured.allowedRadiusMeters} meters to check out, or choose 'Proceed Anyway' for admin approval.`
        );
      }
      isOutOfRange = true;
    }
  }

  const remark = String(data.outcomeNotes || '').trim();
  if (!remark) throw new ApiError(400, 'Remark is required to check out');

  const nextStatus =
    visit.status === VISIT_STATUS.PENDING_APPROVAL || isOutOfRange
      ? VISIT_STATUS.PENDING_APPROVAL
      : VISIT_STATUS.COMPLETED;

  assertTransition(visit.status, nextStatus);

  const photo = await uploadService.uploadImageBuffer(file.buffer);
  const duration = Math.max(0, Math.round((Date.now() - new Date(visit.checkInAt).getTime()) / 60000));
  const origin = await previousTravelPoint(actor, visit);
  const travelKm = origin ? travelKmBetween(origin, { lat, lng }) : 0;

  await visitRepository.updateById(visit._id, {
    status: nextStatus,
    checkOutAt: new Date(),
    checkOutLat: lat,
    checkOutLng: lng,
    checkOutDistanceM: distanceM,
    checkOutPhotoUrl: photo.url,
    checkOutPhotoPublicId: photo.publicId,
    checkOutAddress: String(data.address || '').trim(),
    visitDurationMin: duration,
    travelKm,
    outcomeNotes: remark,
    fieldClosed: true,
  });

  if (isOutOfRange && visit.status !== VISIT_STATUS.PENDING_APPROVAL) {
    const outOfRangeReason = 'Outside location / Geofence exception';
    const outOfRangeExplanation = String(data.explanation || `Checked out ${distanceM}m away from registered customer location`).trim();
    await visitApprovalRepository.create({
      visit: visit._id,
      kind: VISIT_EXCEPTION_KIND.OUT_OF_RANGE,
      requestedBy: actor._id,
      requestedAt: new Date(),
      decision: VISIT_APPROVAL_DECISION.PENDING,
      missedReason: outOfRangeReason,
      missedExplanation: outOfRangeExplanation,
    });
    await visitRepository.updateById(visit._id, {
      missedReason: outOfRangeReason,
      missedExplanation: outOfRangeExplanation,
    });
  }

  return getById(visit._id, actor);
}

async function reportMissed(id, data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can report a missed visit');
  await requireTodayPunchIn(actor);
  const { reason, explanation } = assertMissedReason(data.reason, data.explanation);

  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  assertTransition(visit.status, VISIT_STATUS.PENDING_APPROVAL);

  const kind = visit.checkInAt ? VISIT_EXCEPTION_KIND.INCOMPLETE : VISIT_EXCEPTION_KIND.MISSED;
  await visitApprovalRepository.create({
    visit: visit._id,
    kind,
    requestedBy: actor._id,
    requestedAt: new Date(),
    decision: VISIT_APPROVAL_DECISION.PENDING,
    missedReason: reason,
    missedExplanation: explanation,
  });
  await visitRepository.updateById(visit._id, {
    status: VISIT_STATUS.PENDING_APPROVAL,
    missedReason: reason,
    missedExplanation: explanation,
    fieldClosed: true,
  });
  return getById(visit._id, actor);
}

async function listApprovals(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const filter = {};
  if (query.decision) filter.decision = query.decision;
  if (actor.role !== ROLES.ADMIN) {
    const mine = await visitRepository.find({ salesperson: actor._id }, { select: '_id' });
    filter.visit = { $in: mine.map((visit) => visit._id) };
  }
  const { items, total } = await visitApprovalRepository.paginate({
    filter,
    sort: { requestedAt: -1 },
    skip,
    limit: pageSize,
    populate: APPROVAL_POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  checkOut,
  reportMissed,
  listApprovals,
};
