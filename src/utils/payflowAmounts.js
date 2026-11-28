const ApiError = require('./ApiError');

function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return NaN;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function isAdvancePayment(payAgainst) {
  return /advance/i.test(String(payAgainst || ''));
}

function computePayflowAmounts({ totalOutstanding, amount, payAgainst }) {
  if (totalOutstanding === '' || totalOutstanding == null) {
    throw new ApiError(400, 'Total outstanding amount is required');
  }
  const outstanding = roundCurrency(totalOutstanding);
  if (!Number.isFinite(outstanding) || outstanding < 0) {
    throw new ApiError(400, 'Total outstanding amount must be 0 or greater');
  }

  const payment = roundCurrency(amount);
  if (!Number.isFinite(payment) || payment <= 0) {
    throw new ApiError(400, 'Payment amount must be greater than 0');
  }

  if (!isAdvancePayment(payAgainst) && payment > outstanding) {
    throw new ApiError(400, 'Payment amount cannot exceed total outstanding amount');
  }

  return {
    totalOutstanding: outstanding,
    amount: payment,
    balanceAmount: roundCurrency(outstanding - payment),
  };
}

module.exports = {
  roundCurrency,
  isAdvancePayment,
  computePayflowAmounts,
};
