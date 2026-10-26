const attendanceRepository = require('../repositories/attendance.repository');
const attendanceCorrectionRepository = require('../repositories/attendanceCorrection.repository');
const visitService = require('./visit.service');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { ROLES, ATTENDANCE_CORRECTION_STATUS, ATTENDANCE_CORRECTION_KIND, ATTENDANCE_QUOTA_MIN, GENDER } = require('../config/constants');
const { ATTENDANCE_STATUS } = require('../models/Attendance.model');
const { kolkataToday } = require('../utils/kolkataDate');
const { isSalesperson } = require('../utils/roles');
const { buildLastWorkingDays, countPhases, durationMin, classifyDay, shiftDate } = require('../utils/attendanceClassify');

const CORRECTION_POPULATE = [
  { path: 'salesperson', select: 'name email' },
  { path: 'requestedBy', select: 'name email' },
  { path: 'reviewedBy', select: 'name email' },
  { path: 'attendance' },
];

function parseIstDateTime(dateStr, hm) {
  const time = String(hm || '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${dateStr}T${time}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
  records.forEach((row) => {
    recordsByDate[row.attendanceDate] = row;
  });
  const pendingByDate = {};
  pending.forEach((row) => {
    pendingByDate[row.attendanceDate] = row;
  });
  const days = buildLastWorkingDays({ today: todayDate, recordsByDate, pendingByDate, count: 7 }).map((day) => {
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
  const expectedMinutes = ATTENDANCE_QUOTA_MIN[actor.gender] || ATTENDANCE_QUOTA_MIN[GENDER.MALE];
  return { today: todayDate, days, counts: countPhases(days), expectedMinutes, gender: actor.gender || GENDER.MALE };
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
    if (rec?.punchOutAt) {
      rec = await attendanceRepository.updateById(rec._id, {
        punchOutAt: null,
        punchOutLat: null,
        punchOutLng: null,
        punchOutAccuracy: null,
        punchOutAddress: null,
        punchOutPhotoUrl: null,
        punchOutPhotoPublicId: null,
        punchInPhotoUrl: photo.url,
        punchInPhotoPublicId: photo.publicId,
        durationMin: null,
        status: ATTENDANCE_STATUS.OPEN,
      });
    } else if (rec?.punchInAt) {
      throw new ApiError(400, 'Already punched in today');
    } else {
      const payload = {
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
      try {
        rec = rec
          ? await attendanceRepository.updateById(rec._id, payload)
          : await attendanceRepository.create(payload);
      } catch (err) {
        if (err.code === 11000) {
          rec = await attendanceRepository.findToday(actor._id, attendanceDate);
          if (rec?.punchInAt) throw new ApiError(400, 'Already punched in today');
        }
        throw err;
      }
    }
  } else {
    if (!rec?.punchInAt) throw new ApiError(400, 'Punch in first');
    if (rec.punchOutAt) throw new ApiError(400, 'Already punched out today');
    if (isSalesperson(actor) && !data.confirmUnfinished) {
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
    const punchOutAt = new Date();
    rec = await attendanceRepository.updateById(rec._id, {
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

  const populated = await attendanceRepository.findById(rec._id, { populate: POPULATE });
  return decorateToday(populated, attendanceDate);
}

async function requestCorrection(data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can request an attendance correction');
  const attendanceDate = String(data.attendanceDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) throw new ApiError(400, 'Date must be YYYY-MM-DD');
  const reason = String(data.reason || '').trim();
  if (!reason) throw new ApiError(400, 'A reason is required');

  const rec = await attendanceRepository.findToday(actor._id, attendanceDate);
  const todayDate = kolkataToday();
  if (attendanceDate === todayDate && !rec?.punchInAt) {
    throw new ApiError(400, 'Use Punch In for today');
  }
  if (attendanceDate === todayDate && rec?.punchInAt && !rec?.punchOutAt) {
    throw new ApiError(400, 'Use Punch Out for today');
  }
  if (rec?.punchInAt && rec?.punchOutAt) throw new ApiError(400, 'This day is already completed');
  const kind = rec?.punchInAt && !rec?.punchOutAt
    ? ATTENDANCE_CORRECTION_KIND.MISSING_OUT
    : ATTENDANCE_CORRECTION_KIND.MISSING_IN;

  const requestedPunchIn = parseIstDateTime(attendanceDate, data.requestedPunchIn);
  const requestedPunchOut = parseIstDateTime(attendanceDate, data.requestedPunchOut);
  if (kind === ATTENDANCE_CORRECTION_KIND.MISSING_OUT && !requestedPunchOut) {
    throw new ApiError(400, 'Requested punch out time is required');
  }
  if (kind === ATTENDANCE_CORRECTION_KIND.MISSING_IN && !requestedPunchIn) {
    throw new ApiError(400, 'Requested punch in time is required');
  }

  const existing = await attendanceCorrectionRepository.findOne({
    salesperson: actor._id,
    attendanceDate,
    status: ATTENDANCE_CORRECTION_STATUS.PENDING,
  });
  if (existing) throw new ApiError(400, 'A correction request is already pending for this date');

  try {
    return await attendanceCorrectionRepository.create({
      attendance: rec?._id || null,
      salesperson: actor._id,
      attendanceDate,
      kind,
      requestedPunchIn,
      requestedPunchOut,
      originalPunchIn: rec?.punchInAt || null,
      originalPunchOut: rec?.punchOutAt || null,
      reason,
      status: ATTENDANCE_CORRECTION_STATUS.PENDING,
      requestedBy: actor._id,
      requestedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(400, 'A correction request is already pending for this date');
    throw err;
  }
}

async function listCorrections(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const filter = actor.role === ROLES.ADMIN ? {} : { salesperson: actor._id };
  if (query.status) filter.status = query.status;
  if (query.salesperson && actor.role === ROLES.ADMIN) filter.salesperson = query.salesperson;
  const { items, total } = await attendanceCorrectionRepository.paginate({
    filter,
    sort: { requestedAt: -1 },
    skip,
    limit: pageSize,
    populate: CORRECTION_POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function reviewCorrection(id, data, actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Admin only');
  const decision = String(data.decision || '').toUpperCase();
  if (decision !== ATTENDANCE_CORRECTION_STATUS.APPROVED && decision !== ATTENDANCE_CORRECTION_STATUS.REJECTED) {
    throw new ApiError(400, 'Decision must be APPROVED or REJECTED');
  }
  const adminComment = String(data.adminComment || data.rejectionReason || '').trim();
  if (decision === ATTENDANCE_CORRECTION_STATUS.REJECTED && !adminComment) {
    throw new ApiError(400, 'Rejection reason is required');
  }

  const correction = await attendanceCorrectionRepository.findById(id);
  if (!correction) throw new ApiError(404, 'Correction request not found');
  if (correction.status !== ATTENDANCE_CORRECTION_STATUS.PENDING) {
    throw new ApiError(400, 'This request has already been reviewed');
  }

  if (decision === ATTENDANCE_CORRECTION_STATUS.APPROVED) {
    let rec = correction.attendance
      ? await attendanceRepository.findById(correction.attendance)
      : await attendanceRepository.findToday(correction.salesperson, correction.attendanceDate);
    const punchInAt = correction.requestedPunchIn || rec?.punchInAt;
    const punchOutAt = correction.requestedPunchOut || rec?.punchOutAt;
    const updates = {
      punchInAt: punchInAt || rec?.punchInAt || null,
      punchOutAt: punchOutAt || rec?.punchOutAt || null,
      durationMin: durationMin(punchInAt || rec?.punchInAt, punchOutAt || rec?.punchOutAt),
      status: punchOutAt || rec?.punchOutAt ? ATTENDANCE_STATUS.CLOSED : ATTENDANCE_STATUS.OPEN,
    };
    if (!rec) {
      rec = await attendanceRepository.create({
        salesperson: correction.salesperson,
        attendanceDate: correction.attendanceDate,
        ...updates,
      });
    } else {
      await attendanceRepository.updateById(rec._id, updates);
    }
  }

  await attendanceCorrectionRepository.updateById(correction._id, {
    status: decision,
    reviewedBy: actor._id,
    reviewedAt: new Date(),
    adminComment,
  });
  return attendanceCorrectionRepository.findById(correction._id, { populate: CORRECTION_POPULATE });
}

module.exports = { list, today, summary, punch, requestCorrection, listCorrections, reviewCorrection };
