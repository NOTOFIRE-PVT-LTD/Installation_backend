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

const { assertOwnVisit, assertSalespersonUser, decorate, geofenceMeters, getById, loadAuthorizedCustomer, measureAgainstVisit, parseCoords, requireTodayPunchIn, resolveLocation } = require('./visit.listAndtodayPlanAndgetByIdAndgeofenceMeters');
const { assertSequentialStart } = require('./visit.reviewApprovalAndunfinishedForDayAndgetDay');

async function create(data, actor) {
  const salespersonId = actor.role === ROLES.ADMIN ? data.salesperson : actor._id;
  if (!salespersonId) throw new ApiError(400, 'Salesperson is required');
  if (actor.role !== ROLES.ADMIN && String(data.salesperson || actor._id) !== String(actor._id)) {
    throw new ApiError(403, 'You cannot assign a visit to another salesperson');
  }
  if (isSalesperson(actor)) await requireTodayPunchIn(actor);

  await assertSalespersonUser(salespersonId);
  const customer = await loadAuthorizedCustomer(data.customer, actor, salespersonId);

  const visitType = String(data.visitType || VISIT_TYPE.HOURLY).toUpperCase();
  if (!Object.values(VISIT_TYPE).includes(visitType)) throw new ApiError(400, 'Visit type must be HOURLY or TOUR');
  const visitDate = String(data.visitDate || '').trim();
  const visitDateTo = String(data.visitDateTo || (visitType === VISIT_TYPE.TOUR ? '' : visitDate) || '').trim();
  const plannedTime = String(data.plannedTime || (visitType === VISIT_TYPE.TOUR ? '09:00' : '')).trim().slice(0, 5);
  const endTime = String(data.endTime || '').trim().slice(0, 5);
  const purpose = String(data.purpose || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) throw new ApiError(400, 'Visit date must be YYYY-MM-DD');
  if (visitType === VISIT_TYPE.TOUR) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDateTo)) throw new ApiError(400, 'Tour To date is required');
    if (visitDateTo < visitDate) throw new ApiError(400, 'To date cannot be before from date');
  }
  if (!/^\d{2}:\d{2}$/.test(plannedTime)) throw new ApiError(400, 'Start time must be HH:mm');
  if (visitType === VISIT_TYPE.HOURLY && !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new ApiError(400, 'End time is required for hourly visits');
  }
  if (!purpose) throw new ApiError(400, 'Purpose is required');

  const lat = toCoord(data.locationLat);
  const lng = toCoord(data.locationLng);

  const visit = await visitRepository.create({
    salesperson: salespersonId,
    customer: customer._id,
    visitType,
    visitDate,
    visitDateTo: visitType === VISIT_TYPE.TOUR ? visitDateTo : visitDate,
    plannedTime,
    endTime: visitType === VISIT_TYPE.HOURLY ? endTime : '',
    purpose,
    notes: String(data.notes || '').trim(),
    locationLat: lat,
    locationLng: lng,
    locationAddress: String(data.locationAddress || '').trim(),
    status: VISIT_STATUS.PLANNED,
    createdBy: actor._id,
  });
  return getById(visit._id, actor);
}

async function proximity(id, query, actor) {
  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  const { lat, lng } = parseCoords(query.lat, query.lng);
  const location = resolveLocation(visit, visit.customer);
  if (location.lat == null || location.lng == null) {
    return decorate(visit, {
      location: null,
      distanceM: 0,
      allowedRadiusMeters: geofenceMeters(),
      withinGeofence: true,
      isInitialSetup: true,
    });
  }
  const measured = measureAgainstVisit(visit, visit.customer, lat, lng);
  return decorate(visit, measured);
}

async function checkIn(id, data, file, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can check in');
  await requireTodayPunchIn(actor);
  if (!file?.buffer) throw new ApiError(400, 'Check-in photo is required');

  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  if (visit.checkInAt) throw new ApiError(400, 'Visit has already been checked in');

  const { lat, lng } = parseCoords(data.lat, data.lng);
  const location = resolveLocation(visit, visit.customer);
  const proceedAnyway = data.proceedAnyway === true || data.proceedAnyway === 'true';
  let isOutOfRange = false;
  let distanceM = 0;

  if (location.lat == null || location.lng == null) {
    if (visit.customer?._id) {
      await customerRepository.updateById(visit.customer._id, {
        locationLat: lat,
        locationLng: lng,
        address: data.address || visit.customer.address,
      });
    }
  } else {
    const measured = measureAgainstVisit(visit, visit.customer, lat, lng);
    distanceM = Math.round(measured.distanceM);
    if (!measured.withinGeofence) {
      if (!proceedAnyway) {
        throw new ApiError(
          400,
          `You are outside the allowed customer location (${distanceM}m away). Move within ${measured.allowedRadiusMeters} meters to check in, or choose 'Proceed Anyway' for admin approval.`
        );
      }
      isOutOfRange = true;
    }
  }

  const nextStatus = isOutOfRange ? VISIT_STATUS.PENDING_APPROVAL : VISIT_STATUS.IN_PROGRESS;
  assertTransition(visit.status, nextStatus);
  await assertSequentialStart(visit, actor);

  const photo = await uploadService.uploadImageBuffer(file.buffer);
  const outOfRangeReason = 'Outside location / Geofence exception';
  const outOfRangeExplanation = String(data.explanation || `Checked in ${distanceM}m away from registered customer location`).trim();

  await visitRepository.updateById(visit._id, {
    status: nextStatus,
    checkInAt: new Date(),
    checkInLat: lat,
    checkInLng: lng,
    checkInDistanceM: distanceM,
    checkInPhotoUrl: photo.url,
    checkInPhotoPublicId: photo.publicId,
    checkInAddress: String(data.address || '').trim(),
    ...(isOutOfRange
      ? {
          missedReason: outOfRangeReason,
          missedExplanation: outOfRangeExplanation,
        }
      : {}),
  });

  if (isOutOfRange) {
    await visitApprovalRepository.create({
      visit: visit._id,
      kind: VISIT_EXCEPTION_KIND.OUT_OF_RANGE,
      requestedBy: actor._id,
      requestedAt: new Date(),
      decision: VISIT_APPROVAL_DECISION.PENDING,
      missedReason: outOfRangeReason,
      missedExplanation: outOfRangeExplanation,
    });
  }

  return getById(visit._id, actor);
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  create,
  proximity,
  checkIn,
};
