const { VISIT_STATUS, MISSED_VISIT_REASONS } = require('../config/constants');
const ApiError = require('./ApiError');

const ALLOWED = Object.freeze({
  [VISIT_STATUS.PLANNED]: [VISIT_STATUS.IN_PROGRESS, VISIT_STATUS.PENDING_APPROVAL],
  [VISIT_STATUS.IN_PROGRESS]: [VISIT_STATUS.COMPLETED, VISIT_STATUS.PENDING_APPROVAL],
  [VISIT_STATUS.PENDING_APPROVAL]: [VISIT_STATUS.APPROVED_MISSED, VISIT_STATUS.REJECTED],
  [VISIT_STATUS.REJECTED]: [VISIT_STATUS.IN_PROGRESS, VISIT_STATUS.PENDING_APPROVAL],
  [VISIT_STATUS.APPROVED_MISSED]: [],
  [VISIT_STATUS.COMPLETED]: [],
});

function assertTransition(from, to) {
  if (!(ALLOWED[from] || []).includes(to)) {
    throw new ApiError(400, `Cannot change visit from ${from} to ${to}`);
  }
}

function assertMissedReason(reason, explanation) {
  const selected = String(reason || '').trim();
  if (!MISSED_VISIT_REASONS.includes(selected)) {
    throw new ApiError(400, 'A missed-visit reason is required');
  }
  if (selected === 'Other' && !String(explanation || '').trim()) {
    throw new ApiError(400, 'Explain the reason when Other is selected');
  }
  return { reason: selected, explanation: String(explanation || '').trim() };
}

function isOpenVisitStatus(status) {
  return (
    status === VISIT_STATUS.PLANNED ||
    status === VISIT_STATUS.IN_PROGRESS ||
    status === VISIT_STATUS.PENDING_APPROVAL ||
    status === VISIT_STATUS.REJECTED
  );
}

module.exports = { ALLOWED, assertTransition, assertMissedReason, isOpenVisitStatus };
