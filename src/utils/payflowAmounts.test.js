const test = require('node:test');
const assert = require('node:assert/strict');
const { roundCurrency, isAdvancePayment, computePayflowAmounts } = require('./payflowAmounts');

test('roundCurrency avoids floating-point drift', () => {
  assert.equal(roundCurrency(100.1 - 50.2), 49.9);
  assert.equal(roundCurrency(1234.567), 1234.57);
});

test('isAdvancePayment detects Advance variants case-insensitively', () => {
  assert.equal(isAdvancePayment('Advance'), true);
  assert.equal(isAdvancePayment('advance_(bill/PI)'), true);
  assert.equal(isAdvancePayment('Tax Invoice'), false);
  assert.equal(isAdvancePayment('Proforma Invoice'), false);
});

test('computePayflowAmounts computes exact balance for normal invoices', () => {
  const res = computePayflowAmounts({
    totalOutstanding: 514506,
    amount: 500000,
    payAgainst: 'Tax Invoice',
  });
  assert.deepEqual(res, { totalOutstanding: 514506, amount: 500000, balanceAmount: 14506 });
});

test('computePayflowAmounts rejects payment exceeding outstanding for non-Advance', () => {
  assert.throws(
    () => computePayflowAmounts({ totalOutstanding: 5000, amount: 6000, payAgainst: 'Tax Invoice' }),
    /cannot exceed total outstanding/i
  );
  assert.throws(
    () => computePayflowAmounts({ totalOutstanding: '', amount: 1000, payAgainst: 'Tax Invoice' }),
    /Total outstanding amount is required/i
  );
  assert.throws(
    () => computePayflowAmounts({ totalOutstanding: 5000, amount: 0, payAgainst: 'Tax Invoice' }),
    /greater than 0/i
  );
});

test('computePayflowAmounts permits advance payments with 0 or lower outstanding', () => {
  const res = computePayflowAmounts({
    totalOutstanding: 0,
    amount: 19607,
    payAgainst: 'Advance',
  });
  assert.deepEqual(res, { totalOutstanding: 0, amount: 19607, balanceAmount: -19607 });
});
