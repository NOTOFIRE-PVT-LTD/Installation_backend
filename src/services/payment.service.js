const paymentRepository = require('../repositories/payment.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { PAYMENT_STATUS } = require('../config/constants');

const ALLOWED_SORT_FIELDS = ['amount', 'status', 'method', 'createdAt'];
const POPULATE = [
  { path: 'project', select: 'projectName panelSerialNo' },
  { path: 'approvedBy', select: 'name email' },
];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.method) filter.method = query.method;
  if (query.project) filter.project = query.project;

  const { items, total } = await paymentRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const payment = await paymentRepository.findById(id, { populate: POPULATE });
  if (!payment) throw new ApiError(404, 'Payment not found');
  return payment;
}

async function create(data, actorId) {
  const payment = await paymentRepository.create({
    project: data.project,
    method: data.method,
    amount: data.amount,
    remarks: data.remarks || '',
    createdBy: actorId,
  });

  return getById(payment._id);
}

async function update(id, data) {
  const payment = await paymentRepository.findById(id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new ApiError(400, 'Only pending payments can be edited');
  }

  const updates = {};
  ['amount', 'remarks', 'method'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  await paymentRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const payment = await paymentRepository.deleteById(id);
  if (!payment) throw new ApiError(404, 'Payment not found');
}

async function updateStatus(id, newStatus, actorId) {
  const payment = await paymentRepository.findById(id);
  if (!payment) throw new ApiError(404, 'Payment not found');

  if (newStatus === PAYMENT_STATUS.APPROVED) {
    if (payment.status !== PAYMENT_STATUS.PENDING) {
      throw new ApiError(400, `Cannot approve a payment with status "${payment.status}"`);
    }
    await paymentRepository.updateById(id, {
      status: PAYMENT_STATUS.APPROVED,
      approvedBy: actorId,
      approvedAt: new Date(),
    });
  } else if (newStatus === PAYMENT_STATUS.PAID) {
    if (payment.status !== PAYMENT_STATUS.APPROVED) {
      throw new ApiError(400, 'Only approved payments can be marked as paid');
    }
    await paymentRepository.updateById(id, { status: PAYMENT_STATUS.PAID, paidAt: new Date() });
  } else if (newStatus === PAYMENT_STATUS.PENDING) {
    if (payment.status !== PAYMENT_STATUS.APPROVED) {
      throw new ApiError(400, 'Only approved payments can be reverted to pending');
    }
    await paymentRepository.updateById(id, {
      status: PAYMENT_STATUS.PENDING,
      approvedBy: null,
      approvedAt: null,
    });
  }

  return getById(id);
}

module.exports = { list, getById, create, update, remove, updateStatus };
