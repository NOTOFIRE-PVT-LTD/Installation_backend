const attendanceRepository = require('../repositories/attendance.repository');
const attendanceCorrectionRepository = require('../repositories/attendanceCorrection.repository');
const visitService = require('./visit.service');
const uploadService = require('./upload.service');
const attendanceCorrectionService = require('./attendanceCorrection.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { ROLES, ATTENDANCE_CORRECTION_STATUS, ATTENDANCE_QUOTA_MIN, GENDER } = require('../config/constants');
const { ATTENDANCE_STATUS } = require('../models/Attendance.model');
const { kolkataToday } = require('../utils/kolkataDate');
const { isSalesperson } = require('../utils/roles');
const { buildLastWorkingDays, countPhases, durationMin, classifyDay, shiftDate } = require('../utils/attendanceClassify');

const ALLOWED_SORT_FIELDS = ['attendanceDate', 'punchInAt', 'punchOutAt', 'status', 'createdAt'];
const POPULATE = [{ path: 'salesperson', select: 'name email mobileNumber' }];

function locationFrom(data) {
  const lat = data.lat === '' || data.lat == null ? null : Number(data.lat);
  const lng = data.lng === '' || data.lng == null ? null : Number(data.lng);
  const accuracy = data.accuracy === '' || data.accuracy == null ? null : Number(data.accuracy);
  const address = String(data.address || '').trim();
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    address: address || null,
  };
}

async function list(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS, { attendanceDate: -1 });
  const filter = actor.role === ROLES.ADMIN ? {} : { salesperson: actor._id };

  if (query.salesperson && actor.role === ROLES.ADMIN) filter.salesperson = query.salesperson;
  if (query.status) filter.status = query.status;
  if (query.from) filter.attendanceDate = { ...(filter.attendanceDate || {}), $gte: query.from };
  if (query.to) filter.attendanceDate = { ...(filter.attendanceDate || {}), $lte: query.to };

  const { items, total } = await attendanceRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

function decorateToday(record, attendanceDate) {
  const canIn = !record?.punchInAt || Boolean(record?.punchOutAt);
  const canOut = Boolean(record?.punchInAt) && !record?.punchOutAt;
  const phase = classifyDay({ date: attendanceDate, today: attendanceDate, record });
  let blockedReason = null;
  if (record?.punchOutAt) blockedReason = 'Punched out. Punch in again if that was a mistake.';
  else if (record?.punchInAt) blockedReason = 'You are already punched in.';
  return { attendanceDate, record, canIn, canOut, phase, blockedReason };
}

async function today(actor) {
  const attendanceDate = kolkataToday();
  const record = await attendanceRepository.findToday(actor._id, attendanceDate);
  return decorateToday(record, attendanceDate);
}

function mapSummaryDays(workingDays) {
  return workingDays.map((day) => {
    const rec = day.record;
    let minutes = null;
    if (rec?.punchInAt && rec?.punchOutAt) {
      minutes = rec.durationMin != null ? rec.durationMin : durationMin(rec.punchInAt, rec.punchOutAt);
    } else if (day.phase === 'WORKING' && rec?.punchInAt) {
      minutes = durationMin(rec.punchInAt, null);
    }
    return {
      date: day.date,
      phase: day.phase,
      punchInAt: rec?.punchInAt || null,
      punchOutAt: rec?.punchOutAt || null,
      punchInLat: rec?.punchInLat ?? null,
      punchInLng: rec?.punchInLng ?? null,
      punchOutLat: rec?.punchOutLat ?? null,
      punchOutLng: rec?.punchOutLng ?? null,
      durationMin: minutes,
      attendanceId: rec?._id || null,
      pendingCorrectionId: day.pendingCorrection?._id || null,
    };
  });
}

async function summary(actor) {
  const todayDate = kolkataToday();
  const from = shiftDate(todayDate, -12);
  const salespersonId = actor._id;
  const filter = { salesperson: salespersonId, attendanceDate: { $gte: from, $lte: todayDate } };
  const [records, pending] = await Promise.all([
    attendanceRepository.find(filter, { sort: { attendanceDate: -1 } }),
    attendanceCorrectionRepository.find({
      salesperson: salespersonId,
      status: ATTENDANCE_CORRECTION_STATUS.PENDING,
      attendanceDate: { $gte: from, $lte: todayDate },
    }),
  ]);
  const recordsByDate = {};
  records.forEach((row) => { recordsByDate[row.attendanceDate] = row; });
  const pendingByDate = {};
  pending.forEach((row) => { pendingByDate[row.attendanceDate] = row; });

  const workingDays = buildLastWorkingDays({ today: todayDate, recordsByDate, pendingByDate, count: 7 });
  const days = mapSummaryDays(workingDays);
  const expectedMinutes = ATTENDANCE_QUOTA_MIN[actor.gender] || ATTENDANCE_QUOTA_MIN[GENDER.MALE];
  return { today: todayDate, days, counts: countPhases(days), expectedMinutes, gender: actor.gender || GENDER.MALE };
}

function buildPunchInPayload(actor, attendanceDate, loc, photo) {
  return {
    salesperson: actor._id,
    attendanceDate,
    punchInAt: new Date(),
    punchInLat: loc.lat,
    punchInLng: loc.lng,
    punchInAccuracy: loc.accuracy,
    punchInAddress: loc.address,
    punchInPhotoUrl: photo.url,
    punchInPhotoPublicId: photo.publicId,
    status: ATTENDANCE_STATUS.OPEN,
  };
}

async function handlePunchIn(rec, actor, attendanceDate, loc, photo) {
  if (rec?.punchOutAt) {
    return attendanceRepository.updateById(rec._id, {
      punchOutAt: null, punchOutLat: null, punchOutLng: null, punchOutAccuracy: null,
      punchOutAddress: null, punchOutPhotoUrl: null, punchOutPhotoPublicId: null,
      punchInPhotoUrl: photo.url, punchInPhotoPublicId: photo.publicId,
      durationMin: null, status: ATTENDANCE_STATUS.OPEN,
    });
  }
  if (rec?.punchInAt) throw new ApiError(400, 'Already punched in today');
  const payload = buildPunchInPayload(actor, attendanceDate, loc, photo);
  return rec ? attendanceRepository.updateById(rec._id, payload) : attendanceRepository.create(payload);
}

async function checkUnfinishedVisits(actor, attendanceDate, confirmUnfinished) {
  if (!isSalesperson(actor) || confirmUnfinished) return;
  const unfinished = await visitService.unfinishedForDay(actor._id, attendanceDate);
  if (unfinished.length) {
    throw new ApiError(
      409,
      'You have unfinished visits. Confirm punch out without marking them completed.',
      unfinished.map((v) => ({
        _id: v._id,
        visitDate: v.visitDate,
        plannedTime: v.plannedTime,
        purpose: v.purpose,
        status: v.status,
      }))
    );
  }
}

async function handlePunchOut(rec, actor, attendanceDate, loc, photo, confirmUnfinished) {
  if (!rec?.punchInAt) throw new ApiError(400, 'Punch in first');
  if (rec.punchOutAt) throw new ApiError(400, 'Already punched out today');
  await checkUnfinishedVisits(actor, attendanceDate, confirmUnfinished);
  const punchOutAt = new Date();
  return attendanceRepository.updateById(rec._id, {
    punchOutAt,
    punchOutLat: loc.lat,
    punchOutLng: loc.lng,
    punchOutAccuracy: loc.accuracy,
    punchOutAddress: loc.address,
    punchOutPhotoUrl: photo.url,
    punchOutPhotoPublicId: photo.publicId,
    durationMin: durationMin(rec.punchInAt, punchOutAt),
    status: ATTENDANCE_STATUS.CLOSED,
  });
}

async function punch(data, file, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can punch attendance');
  const kind = String(data.kind || '').toUpperCase();
  if (kind !== 'IN' && kind !== 'OUT') throw new ApiError(400, 'Invalid punch');
  if (!file?.buffer) throw new ApiError(400, 'A selfie is required to punch in or punch out');
  const photo = await uploadService.uploadImageBuffer(file.buffer);

  const attendanceDate = kolkataToday();
  const loc = locationFrom(data);
  let rec = await attendanceRepository.findToday(actor._id, attendanceDate);

  if (kind === 'IN') {
    try {
      rec = await handlePunchIn(rec, actor, attendanceDate, loc, photo);
    } catch (err) {
      if (err.code === 11000) {
        rec = await attendanceRepository.findToday(actor._id, attendanceDate);
        if (rec?.punchInAt) throw new ApiError(400, 'Already punched in today');
      }
      throw err;
    }
  } else {
    rec = await handlePunchOut(rec, actor, attendanceDate, loc, photo, data.confirmUnfinished);
  }

  const populated = await attendanceRepository.findById(rec._id, { populate: POPULATE });
  return decorateToday(populated, attendanceDate);
}

module.exports = {
  list,
  today,
  summary,
  punch,
  requestCorrection: attendanceCorrectionService.requestCorrection,
  listCorrections: attendanceCorrectionService.listCorrections,
  reviewCorrection: attendanceCorrectionService.reviewCorrection,
};
