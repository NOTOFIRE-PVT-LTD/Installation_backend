const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { VISIT_STATUS } = require('../config/constants');
const { assertTransition, assertMissedReason, isOpenVisitStatus } = require('./visitStatus');

describe('visitStatus', () => {
  it('allows planned → in progress → completed', () => {
    assert.doesNotThrow(() => assertTransition(VISIT_STATUS.PLANNED, VISIT_STATUS.IN_PROGRESS));
    assert.doesNotThrow(() => assertTransition(VISIT_STATUS.IN_PROGRESS, VISIT_STATUS.COMPLETED));
  });

  it('rejects completed → planned', () => {
    assert.throws(() => assertTransition(VISIT_STATUS.COMPLETED, VISIT_STATUS.PLANNED), /Cannot change visit/);
  });

  it('requires a real missed reason', () => {
    assert.throws(() => assertMissedReason('Missed'), /reason is required/);
    assert.throws(() => assertMissedReason('Other', '  '), /Explain the reason/);
    const ok = assertMissedReason('Customer cancelled', '');
    assert.equal(ok.reason, 'Customer cancelled');
  });

  it('treats planned and in-progress as unfinished', () => {
    assert.equal(isOpenVisitStatus(VISIT_STATUS.PLANNED), true);
    assert.equal(isOpenVisitStatus(VISIT_STATUS.COMPLETED), false);
    assert.equal(isOpenVisitStatus(VISIT_STATUS.APPROVED_MISSED), false);
  });
});
