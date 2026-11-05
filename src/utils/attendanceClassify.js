function shiftDate(yyyyMmDd, delta) {
  const [year, month, day] = String(yyyyMmDd).split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return dt.toISOString().slice(0, 10);
}

function durationMin(punchInAt, punchOutAt, now = Date.now()) {
  if (!punchInAt) return null;
  const end = punchOutAt ? new Date(punchOutAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(punchInAt).getTime()) / 60000));
}

function formatDuration(minutes) {
  if (minutes == null) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')} hours`;
}

function classifyDay({ date, today, record, pendingCorrection }) {
  if (pendingCorrection) return 'PENDING';
  if (!record?.punchInAt) return date === today ? 'NOT_STARTED' : 'MISSING';
  if (!record.punchOutAt) return date === today ? 'WORKING' : 'INCOMPLETE';
  return 'COMPLETED';
}

function weekdayUtc(yyyyMmDd) {
  const [year, month, day] = String(yyyyMmDd).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function buildLastWorkingDays({ today, recordsByDate = {}, pendingByDate = {}, count = 6 }) {
  const days = [];
  let i = 0;
  while (days.length < count && i < 21) {
    const date = shiftDate(today, -i);
    i += 1;
    if (weekdayUtc(date) === 0) continue;
    const record = recordsByDate[date] || null;
    const pendingCorrection = pendingByDate[date] || null;
    days.push({
      date,
      record,
      pendingCorrection,
      phase: classifyDay({ date, today, record, pendingCorrection }),
    });
  }
  return days;
}

function countPhases(days) {
  return days.reduce((acc, day) => {
    acc[day.phase] = (acc[day.phase] || 0) + 1;
    return acc;
  }, {});
}

module.exports = {
  shiftDate,
  durationMin,
  formatDuration,
  classifyDay,
  weekdayUtc,
  buildLastWorkingDays,
  countPhases,
};
