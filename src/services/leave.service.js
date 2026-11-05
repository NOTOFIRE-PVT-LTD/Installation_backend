const leaveRepository = require('../repositories/leave.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');
const { isSalesperson } = require('../utils/roles');
const { ROLES, LEAVE_PAY, LEAVE_STATUS } = require('../config/constants');

const POPULATE = [
  { path: 'salesperson', select: 'name email gender' },
  { path: 'reviewedBy', select: 'name email' },
];

async function create(data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can apply for leave');
  const fromDate = String(data.fromDate || '').trim();
  const toDate = String(data.toDate || '').trim();
  const reason = String(data.reason || '').trim();
  const payType = String(data.payType || '').toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new ApiError(400, 'Dates must be YYYY-MM-DD');
  }
  if (toDate < fromDate) throw new ApiError(400, 'To date cannot be before from date');
  if (!reason) throw new ApiError(400, 'A reason is required');
  if (!Object.values(LEAVE_PAY).includes(payType)) throw new ApiError(400, 'Pay type must be PAID or UNPAID');

  if (payType === LEAVE_PAY.PAID) {
    const used = await leaveRepository.countDocuments({
      salesperson: actor._id,
      payType: LEAVE_PAY.PAID,
      status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
    });
    if (used) throw new ApiError(400, 'Paid leave can be used only once');
  }

  return leaveRepository.create({
    salesperson: actor._id,
    fromDate,
    toDate,
    startTime: String(data.startTime || '').slice(0, 5),
    endTime: String(data.endTime || '').slice(0, 5),
    reason,
    payType,
    status: LEAVE_STATUS.PENDING,
    requestedAt: new Date(),
  });
}

async function list(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const filter = actor.role === ROLES.ADMIN ? {} : { salesperson: actor._id };
  if (query.status) filter.status = query.status;
  const { items, total } = await leaveRepository.paginate({
    filter,
    sort: { requestedAt: -1 },
    skip,
    limit: pageSize,
    populate: POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function review(id, data, actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Admin only');
  const decision = String(data.decision || '').toUpperCase();
  if (decision !== LEAVE_STATUS.APPROVED && decision !== LEAVE_STATUS.REJECTED) {
    throw new ApiError(400, 'Decision must be APPROVED or REJECTED');
  }
  const adminComment = String(data.adminComment || data.rejectionReason || '').trim();
  if (decision === LEAVE_STATUS.REJECTED && !adminComment) {
    throw new ApiError(400, 'Rejection reason is required');
  }
  const leave = await leaveRepository.findById(id);
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== LEAVE_STATUS.PENDING) throw new ApiError(400, 'This request has already been reviewed');
  await leaveRepository.updateById(leave._id, {
    status: decision,
    reviewedBy: actor._id,
    reviewedAt: new Date(),
    adminComment,
  });
  return leaveRepository.findById(leave._id, { populate: POPULATE });
}

module.exports = { create, list, review };
