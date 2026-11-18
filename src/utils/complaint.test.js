const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateWarrantyStatus } = require('./warranty');
const { canTransitionStatus } = require('./statusFlow');

describe('Warranty Status Calculation', () => {
  test('returns IN_WARRANTY for unit dispatched 6 months ago', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const result = calculateWarrantyStatus(sixMonthsAgo);
    assert.equal(result.status, 'IN_WARRANTY');
    assert.equal(result.isExpiringSoon, false);
    assert.ok(result.daysRemaining > 60);
  });

  test('returns WARRANTY_EXPIRING within 60 days of 24-month warranty end', () => {
    const almostTwoYearsAgo = new Date();
    almostTwoYearsAgo.setMonth(almostTwoYearsAgo.getMonth() - 23);
    const result = calculateWarrantyStatus(almostTwoYearsAgo);
    assert.equal(result.status, 'WARRANTY_EXPIRING');
    assert.equal(result.isExpiringSoon, true);
    assert.ok(result.daysRemaining <= 60);
    assert.ok(result.daysRemaining > 0);
  });

  test('returns WARRANTY_EXPIRED after 25 months', () => {
    const expiredDate = new Date();
    expiredDate.setMonth(expiredDate.getMonth() - 25);
    const result = calculateWarrantyStatus(expiredDate);
    assert.equal(result.status, 'WARRANTY_EXPIRED');
    assert.equal(result.daysRemaining, 0);
  });

  test('returns UNKNOWN when no dates are provided', () => {
    const result = calculateWarrantyStatus(null, null);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.daysRemaining, null);
  });
});

describe('Complaint Status Lifecycle Transitions', () => {
  test('allows NEW -> ACKNOWLEDGED and NEW -> ASSIGNED', () => {
    assert.equal(canTransitionStatus('NEW', 'ACKNOWLEDGED').allowed, true);
    assert.equal(canTransitionStatus('NEW', 'ASSIGNED').allowed, true);
  });

  test('blocks invalid transition NEW -> RESOLVED without review', () => {
    const res = canTransitionStatus('NEW', 'RESOLVED');
    assert.equal(res.allowed, false);
    assert.match(res.reason, /Cannot transition status/);
  });

  test('allows ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
    assert.equal(canTransitionStatus('ASSIGNED', 'IN_PROGRESS').allowed, true);
    assert.equal(canTransitionStatus('IN_PROGRESS', 'RESOLVED').allowed, true);
    assert.equal(canTransitionStatus('RESOLVED', 'CLOSED').allowed, true);
  });

  test('allows PENDING with remark path from assigned or in progress', () => {
    assert.equal(canTransitionStatus('ASSIGNED', 'PENDING').allowed, true);
    assert.equal(canTransitionStatus('IN_PROGRESS', 'PENDING').allowed, true);
    assert.equal(canTransitionStatus('PENDING', 'IN_PROGRESS').allowed, true);
    assert.equal(canTransitionStatus('PENDING', 'RESOLVED').allowed, true);
  });

  test('allows RESOLVED -> REOPENED', () => {
    assert.equal(canTransitionStatus('RESOLVED', 'REOPENED').allowed, true);
  });
});

