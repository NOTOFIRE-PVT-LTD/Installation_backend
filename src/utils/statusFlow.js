const ALLOWED_TRANSITIONS = {
  NEW: ['ACKNOWLEDGED', 'ASSIGNED'],
  ACKNOWLEDGED: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'ASSIGNED'],
  IN_PROGRESS: ['PENDING', 'RESOLVED'],
  PENDING: ['IN_PROGRESS', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'PENDING'],
  WAITING_FOR_PART: ['IN_PROGRESS', 'RESOLVED', 'PENDING'],
  RESOLUTION_SUBMITTED: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['ASSIGNED', 'IN_PROGRESS'],
  // Legacy aliases
  Open: ['ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS'],
  'In Progress': ['RESOLVED', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_PART'],
};

const STATUS_LABELS = {
  NEW: 'New',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  WAITING_FOR_CUSTOMER: 'Waiting for Customer',
  WAITING_FOR_PART: 'Waiting for Part',
  RESOLUTION_SUBMITTED: 'Resolution Submitted',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

function canTransitionStatus(currentStatus, nextStatus, userRole, adminType) {
  // Super Admin can override any transition
  if (adminType === 'SUPER_ADMIN' || userRole === 'SUPER_ADMIN') {
    return { allowed: true };
  }

  const validTransitions = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!validTransitions.includes(nextStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition status from ${currentStatus} to ${nextStatus}. Allowed: ${validTransitions.join(', ')}`,
    };
  }

  // Non-super-admin engineers cannot directly close tickets
  if (userRole === 'User' && nextStatus === 'CLOSED') {
    return {
      allowed: false,
      reason: 'Field engineers cannot close tickets directly. Administrative closure is required.',
    };
  }

  return { allowed: true };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  canTransitionStatus,
};

