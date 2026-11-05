const visitExpenseRepository = require('../repositories/visitExpense.repository');
const dailyVisitDayRepository = require('../repositories/dailyVisitDay.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');
const { isSalesperson } = require('../utils/roles');
const uploadService = require('./upload.service');
const {
  ROLES,
  DAY_VISIT_STATUS,
  VISIT_EXPENSE_STATUS,
  VISIT_EXPENSE_CLAIM_MODE,
  TRANSPORT_MODE,
  PRIVATE_KM_RATE,
} = require('../config/constants');

const POPULATE = [
  { path: 'salesperson', select: 'name email' },
  { path: 'reviewedBy', select: 'name email' },
  { path: 'dailyVisitDay' },
  { path: 'items.visit', populate: { path: 'customer', select: 'companyName city' } },
];

function itemAmount(mode, km, fare) {
  if (mode === TRANSPORT_MODE.PRIVATE) return Math.round((Number(km) || 0) * PRIVATE_KM_RATE);
  return Math.max(0, Number(fare) || 0);
}

function totals(items) {
  return {
    totalKm: Math.round(items.reduce((sum, row) => sum + (Number(row.distanceKm) || 0), 0) * 10) / 10,
    totalAmount: items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  };
}

function assertOwn(expense, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (String(expense.salesperson._id || expense.salesperson) !== String(actor._id)) {
    throw new ApiError(403, 'You can only access your own expenses');
  }
}

async function list(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const filter = actor.role === ROLES.ADMIN ? {} : { salesperson: actor._id };
  if (query.status) filter.status = query.status;
  if (query.date) filter.date = query.date;
  const { items, total } = await visitExpenseRepository.paginate({
    filter,
    sort: { date: -1 },
    skip,
    limit: pageSize,
    populate: POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getByDate(date, actor) {
  const filter = { date, ...(actor.role === ROLES.ADMIN && actor.querySalesperson ? { salesperson: actor.querySalesperson } : {}) };
  if (actor.role !== ROLES.ADMIN) filter.salesperson = actor._id;
  const expense = await visitExpenseRepository.findOne(filter, { populate: POPULATE });
  if (!expense) throw new ApiError(404, 'Expense not found for this date');
  return expense;
}

async function getById(id, actor) {
  const expense = await visitExpenseRepository.findById(id, { populate: POPULATE });
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertOwn(expense, actor);
  return expense;
}

async function updateDraft(id, data, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can edit expenses');
  const expense = await visitExpenseRepository.findById(id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertOwn(expense, actor);
  if (expense.status !== VISIT_EXPENSE_STATUS.DRAFT) throw new ApiError(400, 'Only draft expenses can be edited');
  const incoming = Array.isArray(data.items) ? data.items : [];
  const items = expense.items.map((row) => {
    const visitId = String(row.visit?._id || row.visit);
    const patch = incoming.find(
      (item) => String(item._id) === String(row._id) || String(item.visit) === visitId
    );
    if (!patch) return row.toObject();
    const mode = String(patch.transportMode || row.transportMode).toUpperCase();
    if (!Object.values(TRANSPORT_MODE).includes(mode)) throw new ApiError(400, 'Invalid transport mode');
    const fare = Number(patch.fare) || 0;
    const km = Number(row.distanceKm) || 0;
    return {
      ...row.toObject(),
      transportMode: mode,
      fare: mode === TRANSPORT_MODE.PRIVATE ? 0 : fare,
      ratePerKm: mode === TRANSPORT_MODE.PRIVATE ? PRIVATE_KM_RATE : 0,
      amount: itemAmount(mode, km, fare),
    };
  });
  const sums = totals(items);
  const gstAmount = data.gstAmount === undefined || data.gstAmount === '' ? expense.gstAmount || 0 : Math.max(0, Number(data.gstAmount) || 0);
  const claimModeRaw = String(data.claimMode || expense.claimMode || VISIT_EXPENSE_CLAIM_MODE.PER_VISIT).toUpperCase();
  const claimMode = Object.values(VISIT_EXPENSE_CLAIM_MODE).includes(claimModeRaw)
    ? claimModeRaw
    : VISIT_EXPENSE_CLAIM_MODE.PER_VISIT;
  const dayTotalAmount =
    data.dayTotalAmount === undefined || data.dayTotalAmount === ''
      ? Number(expense.dayTotalAmount) || 0
      : Math.max(0, Number(data.dayTotalAmount) || 0);
  const patch = {
    items,
    totalKm: sums.totalKm,
    gstAmount,
    claimMode,
    dayTotalAmount,
    totalAmount:
      claimMode === VISIT_EXPENSE_CLAIM_MODE.DAY_TOTAL ? dayTotalAmount : sums.totalAmount,
  };
  await visitExpenseRepository.updateById(expense._id, patch);
  return getById(expense._id, actor);
}

async function attachTicket(id, itemId, file, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can upload a ticket');
  if (!file?.buffer) throw new ApiError(400, 'A ticket file is required');
  const expense = await visitExpenseRepository.findById(id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertOwn(expense, actor);
  if (expense.status !== VISIT_EXPENSE_STATUS.DRAFT) throw new ApiError(400, 'Only draft expenses can be edited');
  const item = expense.items.id(itemId);
  if (!item) throw new ApiError(404, 'Expense item not found');
  const uploaded =
    file.mimetype === 'application/pdf'
      ? await uploadService.uploadDocumentBuffer(file.buffer)
      : await uploadService.uploadImageBuffer(file.buffer);
  item.ticketUrl = uploaded.url;
  item.ticketPublicId = uploaded.publicId;
  await expense.save();
  return getById(expense._id, actor);
}

async function submit(id, actor) {
  if (!isSalesperson(actor)) throw new ApiError(403, 'Only a salesperson can submit expenses');
  const expense = await visitExpenseRepository.findById(id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertOwn(expense, actor);
  if (expense.status !== VISIT_EXPENSE_STATUS.DRAFT) throw new ApiError(400, 'This expense is already submitted');
  const day = await dailyVisitDayRepository.findById(expense.dailyVisitDay);
  if (day?.status !== DAY_VISIT_STATUS.SUBMITTED) throw new ApiError(400, 'Submit the day visits first');
  await visitExpenseRepository.updateById(expense._id, {
    status: VISIT_EXPENSE_STATUS.PENDING_APPROVAL,
    submittedAt: new Date(),
  });
  return getById(expense._id, actor);
}

async function review(id, data, actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Admin only');
  const decision = String(data.decision || '').toUpperCase();
  if (decision !== VISIT_EXPENSE_STATUS.APPROVED && decision !== VISIT_EXPENSE_STATUS.REJECTED) {
    throw new ApiError(400, 'Decision must be APPROVED or REJECTED');
  }
  const adminComment = String(data.adminComment || data.rejectionReason || '').trim();
  if (decision === VISIT_EXPENSE_STATUS.REJECTED && !adminComment) {
    throw new ApiError(400, 'Rejection reason is required');
  }
  const expense = await visitExpenseRepository.findById(id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== VISIT_EXPENSE_STATUS.PENDING_APPROVAL) {
    throw new ApiError(400, 'This expense has already been reviewed');
  }
  await visitExpenseRepository.updateById(expense._id, {
    status: decision,
    reviewedBy: actor._id,
    reviewedAt: new Date(),
    adminComment,
  });
  return getById(expense._id, actor);
}

module.exports = { list, getByDate, getById, updateDraft, attachTicket, submit, review };
