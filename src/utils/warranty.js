/**
 * Automated 2-Year Warranty Calculation Utility
 * Calculates warranty status based on dispatch date or explicit warranty end date.
 * Default warranty is 24 months from dispatch date if not specified.
 * "Expiring soon" is triggered within 60 days of warranty end date.
 */

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function differenceInDays(dateLeft, dateRight) {
  const diffTime = new Date(dateLeft).getTime() - new Date(dateRight).getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function calculateWarrantyStatus(dispatchDate, explicitEndDate = null, warrantyMonths = 24) {
  if (!dispatchDate && !explicitEndDate) {
    return {
      status: 'UNKNOWN',
      startDate: null,
      endDate: null,
      daysRemaining: null,
      isExpiringSoon: false,
    };
  }

  const startDate = dispatchDate ? new Date(dispatchDate) : null;
  let endDate = explicitEndDate ? new Date(explicitEndDate) : null;

  if (!endDate && startDate && !isNaN(startDate.getTime())) {
    endDate = addMonths(startDate, warrantyMonths);
  }

  if (!endDate || isNaN(endDate.getTime())) {
    return {
      status: 'UNKNOWN',
      startDate,
      endDate: null,
      daysRemaining: null,
      isExpiringSoon: false,
    };
  }

  const now = new Date();

  // If now is past end date -> expired
  if (endDate.getTime() < now.getTime()) {
    return {
      status: 'WARRANTY_EXPIRED',
      startDate,
      endDate,
      daysRemaining: 0,
      isExpiringSoon: false,
    };
  }

  const daysRemaining = differenceInDays(endDate, now);

  // If ending in <= 60 days -> expiring soon
  if (daysRemaining <= 60) {
    return {
      status: 'WARRANTY_EXPIRING',
      startDate,
      endDate,
      daysRemaining,
      isExpiringSoon: true,
    };
  }

  return {
    status: 'IN_WARRANTY',
    startDate,
    endDate,
    daysRemaining,
    isExpiringSoon: false,
  };
}

module.exports = {
  calculateWarrantyStatus,
};

