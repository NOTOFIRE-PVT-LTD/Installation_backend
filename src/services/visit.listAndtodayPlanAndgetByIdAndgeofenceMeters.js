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

function geofenceMeters() {
  return Number(env.visitGeofenceMeters) || 100;
}

function coveringDateFilter(date) {
  return {
    visitDate: { $lte: date },
    $or: [{ visitDateTo: null }, { visitDateTo: '' }, { visitDateTo: { $gte: date } }],
  };
}

function parseCoords(lat, lng) {
  const latitude = toCoord(lat);
  const longitude = toCoord(lng);
  if (latitude == null || longitude == null) throw new ApiError(400, 'GPS location is required');
  return { lat: latitude, lng: longitude };
}

function resolveLocation(visit, customer) {
  if (visit.locationLat != null && visit.locationLng != null) {
    return {
      lat: visit.locationLat,
      lng: visit.locationLng,
      address: visit.locationAddress || customer?.address || '',
    };
  }
  return {
    lat: customer?.locationLat ?? null,
    lng: customer?.locationLng ?? null,
    address: customer?.address || '',
  };
}

function decorate(visit, extras = {}) {
  const obj = visit.toObject ? visit.toObject() : visit;
  const customer = obj.customer && obj.customer._id ? obj.customer : extras.customer;
  const location = resolveLocation(obj, customer);
  const radius = geofenceMeters();
  const actionRequired =
    (obj.status === VISIT_STATUS.PLANNED || obj.status === VISIT_STATUS.IN_PROGRESS || obj.status === VISIT_STATUS.REJECTED) &&
    obj.visitDate < kolkataToday();
  return {
    ...obj,
    location,
    allowedRadiusMeters: radius,
    actionRequired,
    ...extras,
  };
}

async function requireTodayPunchIn(actor) {
  if (!isSalesperson(actor)) return;
  const rec = await attendanceRepository.findToday(actor._id, kolkataToday());
  if (!rec?.punchInAt) {
    throw new ApiError(403, 'Punch in first. Attendance marked is required before field visits.');
  }
  if (rec.punchOutAt) throw new ApiError(403, 'You have punched out for today');
}

function assertOwnVisit(visit, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (String(visit.salesperson._id || visit.salesperson) !== String(actor._id)) {
    throw new ApiError(403, 'You can only access your own visits');
  }
}

async function assertSalespersonUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user || user.status === USER_STATUS.INACTIVE) throw new ApiError(400, 'Salesperson not found');
  if (user.jobRole !== JOB_ROLES.SALESPERSON) throw new ApiError(400, 'Assigned user is not a salesperson');
  return user;
}

async function loadAuthorizedCustomer(customerId, actor, salespersonId) {
  const customer = await customerRepository.findById(customerId);
  if (!customer || customer.active === false) throw new ApiError(400, 'Customer not found');
  if (actor.role !== ROLES.ADMIN) {
    if (
      customer.assignedSalesperson &&
      String(customer.assignedSalesperson) !== String(actor._id) &&
      String(customer.createdBy) !== String(actor._id)
    ) {
      throw new ApiError(403, 'You can only create visits for your assigned customers');
    }
  } else if (salespersonId && customer.assignedSalesperson && String(customer.assignedSalesperson) !== String(salespersonId)) {
    // Admin may still plan a visit; assignment is a hint, not a hard block.
  }
  return customer;
}

function measureAgainstVisit(visit, customer, lat, lng) {
  const location = resolveLocation(visit, customer);
  if (location.lat == null || location.lng == null) {
    throw new ApiError(400, 'This visit has no customer location. Add coordinates before check-in.');
  }
  const distanceM = haversineMeters(lat, lng, location.lat, location.lng);
  const allowed = geofenceMeters();
  return {
    location,
    distanceM,
    allowedRadiusMeters: allowed,
    withinGeofence: withinRadius(distanceM, allowed),
  };
}

async function list(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS, { visitDate: 1, plannedTime: 1 });
  const filter = actor.role === ROLES.ADMIN ? {} : { salesperson: actor._id };

  if (query.salesperson && actor.role === ROLES.ADMIN) filter.salesperson = query.salesperson;
  if (query.status) filter.status = query.status;
  if (query.date) Object.assign(filter, coveringDateFilter(query.date));
  if (query.from) filter.visitDate = { ...(filter.visitDate || {}), $gte: query.from };
  if (query.to) filter.visitDate = { ...(filter.visitDate || {}), $lte: query.to };

  const { items, total } = await visitRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: VISIT_POPULATE,
  });
  return buildPaginatedResult({ items: items.map((v) => decorate(v)), total, page, pageSize });
}

async function todayPlan(actor) {
  const visitDate = kolkataToday();
  if (isSalesperson(actor)) {
    const rec = await attendanceRepository.findToday(actor._id, visitDate);
    if (!rec?.punchInAt) return { visitDate, items: [], punchedIn: false };
  }
  const filter = coveringDateFilter(visitDate);
  if (actor.role !== ROLES.ADMIN) filter.salesperson = actor._id;
  const items = await visitRepository.find(filter, {
    sort: { plannedTime: 1 },
    populate: VISIT_POPULATE,
  });
  return { visitDate, items: items.map((v) => decorate(v)), punchedIn: true };
}

async function getById(id, actor) {
  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  return decorate(visit);
}

module.exports = {
  ALLOWED_SORT_FIELDS,
  VISIT_POPULATE,
  APPROVAL_POPULATE,
  geofenceMeters,
  coveringDateFilter,
  parseCoords,
  resolveLocation,
  decorate,
  requireTodayPunchIn,
  assertOwnVisit,
  assertSalespersonUser,
  loadAuthorizedCustomer,
  measureAgainstVisit,
  list,
  todayPlan,
  getById,
};
