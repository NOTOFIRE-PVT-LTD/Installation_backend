const attendanceRepository = require('../repositories/attendance.repository');
const attendanceCorrectionRepository = require('../repositories/attendanceCorrection.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');
const { ROLES, ATTENDANCE_CORRECTION_STATUS, ATTENDANCE_CORRECTION_KIND } = require('../config/constants');
const { ATTENDANCE_STATUS } = require('../models/Attendance.model');
const { kolkataToday } = require('../utils/kolkataDate');
const { isSalesperson } = require('../utils/roles');
const { durationMin } = require('../utils/attendanceClassify');

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

function validateCorrectionRequest(data, rec, todayDate) {
  const attendanceDate = String(data.attendanceDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) throw new ApiError(400, 'Date must be YYYY-MM-DD');
  const reason = String(data.reason || '').trim();
  if (!reason) throw new ApiError(400, 'A reason is required');
  if (attendanceDate === todayDate && !rec?.punchInAt) throw new ApiError(400, 'Use Punch In for today');
  if (attendanceDate === todayDate && rec?.punchInAt && !rec?.punchOutAt) throw new ApiError(400, 'Use Punch Out for today');
  if (rec?.punchInAt && rec?.punchOutAt) throw new ApiError(400, 'This day is already completed');
  return { attendanceDate, reason };
}

function parseCorrectionTimes(kind, data, attendanceDate) {
  const requestedPunchIn = parseIstDateTime(attendanceDate, data.requestedPunchIn);
  const requestedPunchOut = parseIstDateTime(attendanceDate, data.requestedPunchOut);
  if (kind === ATTENDANCE_CORRECTION_KIND.MISSING_OUT && !requestedPunchOut) {
    throw new ApiError(400, 'Requested punch out time is required');
  }
  if (kind === ATTENDANCE_CORRECTION_KIND.MISSING_IN && !requestedPunchIn) {
    throw new ApiError(400, 'Requested punch in time is required');
  }
  return { requestedPunchIn, requestedPunchOut };
}

function buildCorrectionPayload(rec, actor, attendanceDate, kind, times, reason) {
  return {
    attendance: rec?._id || null, salesperson: actor._id, attendanceDate, kind,
    requestedPunchIn: times.requestedPunchIn, requestedPunchOut: times.requestedPunchOut,
    originalPunchIn: rec?.punchInAt || null, originalPunchOut: rec?.punchOutAt || null,
    reason, status: ATTENDANCE_CORRECTION_STATUS.PENDING, requestedBy: actor._id, requestedAt: new Date(),
  };
}

async function requestCorrection(data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can request an attendance correction');
  const rec = await attendanceRepository.findToday(actor._id, data.attendanceDate);
  const { attendanceDate, reason } = validateCorrectionRequest(data, rec, kolkataToday());
  const kind = rec?.punchInAt && !rec?.punchOutAt ? ATTENDANCE_CORRECTION_KIND.MISSING_OUT : ATTENDANCE_CORRECTION_KIND.MISSING_IN;
  const times = parseCorrectionTimes(kind, data, attendanceDate);

  const existing = await attendanceCorrectionRepository.findOne({ salesperson: actor._id, attendanceDate, status: ATTENDANCE_CORRECTION_STATUS.PENDING });
  if (existing) throw new ApiError(400, 'A correction request is already pending for this date');

  try {
    return await attendanceCorrectionRepository.create(buildCorrectionPayload(rec, actor, attendanceDate, kind, times, reason));
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

async function applyApprovedCorrection(correction) {
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
    await attendanceRepository.create({
      salesperson: correction.salesperson,
      attendanceDate: correction.attendanceDate,
      ...updates,
    });
  } else {
    await attendanceRepository.updateById(rec._id, updates);
  }
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
    await applyApprovedCorrection(correction);
  }

  await attendanceCorrectionRepository.updateById(correction._id, {
    status: decision,
    reviewedBy: actor._id,
    reviewedAt: new Date(),
    adminComment,
  });
  return attendanceCorrectionRepository.findById(correction._id, { populate: CORRECTION_POPULATE });
}

module.exports = {
  requestCorrection,
  listCorrections,
  reviewCorrection,
  parseIstDateTime,
  CORRECTION_POPULATE,
};
