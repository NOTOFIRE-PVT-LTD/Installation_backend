const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyDay, buildLastWorkingDays, countPhases, durationMin, formatDuration } = require('./attendanceClassify');

describe('attendanceClassify', () => {
  it('treats today with no punch as not started, not missing', () => {
    assert.equal(classifyDay({ date: '2026-10-26', today: '2026-10-26', record: null }), 'NOT_STARTED');
    assert.equal(classifyDay({ date: '2026-10-25', today: '2026-10-26', record: null }), 'MISSING');
  });

  it('treats punch-in without punch-out as working today and incomplete yesterday', () => {
    const rec = { punchInAt: new Date('2026-10-26T03:30:00.000Z') };
    assert.equal(classifyDay({ date: '2026-10-26', today: '2026-10-26', record: rec }), 'WORKING');
    assert.equal(classifyDay({ date: '2026-10-25', today: '2026-10-26', record: rec }), 'INCOMPLETE');
  });

  it('counts last 6 working days and skips Sunday', () => {
    const days = buildLastWorkingDays({
      today: '2026-10-26',
      recordsByDate: {
        '2026-10-26': { punchInAt: new Date(), punchOutAt: new Date() },
        '2026-10-25': { punchInAt: new Date() },
      },
      pendingByDate: { '2026-10-24': { _id: 'c1' } },
    });
    const counts = countPhases(days);
    assert.equal(days.length, 6);
    assert.equal(days.some((d) => d.date === '2026-10-25'), false);
    assert.equal(counts.COMPLETED, 1);
    assert.equal(counts.PENDING, 1);
    assert.equal(counts.MISSING, 4);
  });

  it('formats punch duration from stored timestamps', () => {
    const start = new Date('2026-10-26T03:42:00.000Z');
    const end = new Date('2026-10-26T12:35:00.000Z');
    assert.equal(durationMin(start, end), 533);
    assert.equal(formatDuration(533), '8:53 hours');
  });
});
