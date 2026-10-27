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
const { assertTransition, assertMissedReason, isOpenVisitStatus } = require('../utils/visitStatus');
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
  assertTransition(visit.status, VISIT_STATUS.IN_PROGRESS);
  await assertSequentialStart(visit, actor);

  const { lat, lng } = parseCoords(data.lat, data.lng);
  const location = resolveLocation(visit, visit.customer);
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
    if (!measured.withinGeofence) {
      throw new ApiError(
        400,
        `You are outside the allowed visit location (${Math.round(measured.distanceM)}m away). Move within ${measured.allowedRadiusMeters} meters of the customer to check in.`
      );
    }
    distanceM = Math.round(measured.distanceM);
  }

  const photo = await uploadService.uploadImageBuffer(file.buffer);
  await visitRepository.updateById(visit._id, {
    status: VISIT_STATUS.IN_PROGRESS,
    checkInAt: new Date(),
    checkInLat: lat,
    checkInLng: lng,
    checkInDistanceM: distanceM,
    checkInPhotoUrl: photo.url,
    checkInPhotoPublicId: photo.publicId,
    checkInAddress: String(data.address || '').trim(),
  });
  return getById(visit._id, actor);
}

async function checkOut(id, data, file, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can check out');
  await requireTodayPunchIn(actor);
  if (!file?.buffer) throw new ApiError(400, 'Check-out photo is required');

  const visit = await visitRepository.findById(id, { populate: VISIT_POPULATE });
  if (!visit) throw new ApiError(404, 'Visit not found');
  assertOwnVisit(visit, actor);
  if (!visit.checkInAt) throw new ApiError(400, 'Check in first');
  assertTransition(visit.status, VISIT_STATUS.COMPLETED);

  const { lat, lng } = parseCoords(data.lat, data.lng);
  const location = resolveLocation(visit, visit.customer);
  let distanceM = 0;
  if (location.lat != null && location.lng != null) {
    const measured = measureAgainstVisit(visit, visit.customer, lat, lng);
    if (!measured.withinGeofence) {
      throw new ApiError(
        400,
        `You are outside the allowed visit location (${Math.round(measured.distanceM)}m away). Move within ${measured.allowedRadiusMeters} meters of the customer to check out.`
      );
    }
    distanceM = Math.round(measured.distanceM);
  }

  const remark = String(data.outcomeNotes || '').trim();
  if (!remark) throw new ApiError(400, 'Remark is required to check out');

  const photo = await uploadService.uploadImageBuffer(file.buffer);
  const duration = Math.max(0, Math.round((Date.now() - new Date(visit.checkInAt).getTime()) / 60000));
  const origin = await previousTravelPoint(actor, visit);
  const travelKm = origin ? travelKmBetween(origin, { lat, lng: lng }) : 0;
  await visitRepository.updateById(visit._id, {
    status: VISIT_STATUS.COMPLETED,
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
  });
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
  const nextStatus = decision === VISIT_APPROVAL_DECISION.APPROVED ? VISIT_STATUS.APPROVED_MISSED : VISIT_STATUS.REJECTED;
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
  const inProgress = queue.find((row) => row.status === VISIT_STATUS.IN_PROGRESS);
  if (inProgress && String(inProgress._id) !== String(visit._id)) {
    throw new ApiError(400, 'Finish the in-progress visit first');
  }
  const next = queue.find(
    (row) => row.status !== VISIT_STATUS.COMPLETED && row.status !== VISIT_STATUS.APPROVED_MISSED
  );
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
  const completed = selected.filter(
    (v) => v.status === VISIT_STATUS.COMPLETED || v.status === VISIT_STATUS.APPROVED_MISSED
  ).length;
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
  const unfinished = selected.filter(
    (v) => v.status !== VISIT_STATUS.COMPLETED && v.status !== VISIT_STATUS.APPROVED_MISSED
  );
  if (unfinished.length) throw new ApiError(400, 'Complete every selected visit before submitting the day');
  await dailyVisitDayRepository.updateById(day._id, { status: DAY_VISIT_STATUS.SUBMITTED, submittedAt: new Date() });
  await ensureDraftExpense(actor._id, date, day, selected);
  return getDay({ date }, actor);
}

const EXPENSE_POPULATE = [
  { path: 'salesperson', select: 'name email' },
  { path: 'reviewedBy', select: 'name email' },
  { path: 'dailyVisitDay' },
  { path: 'items.visit', populate: { path: 'customer', select: 'companyName city' } },
];

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
  list,
  todayPlan,
  getById,
  create,
  proximity,
  checkIn,
  checkOut,
  reportMissed,
  listApprovals,
  reviewApproval,
  unfinishedForDay,
  geofenceMeters,
  getDay,
  selectDay,
  submitDay,
};
