const visitExpenseService = require('../services/visitExpense.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await visitExpenseService.list(req.query, req.user);
  sendSuccess(res, { message: 'Expenses fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const expense = await visitExpenseService.getById(req.params.id, req.user);
  sendSuccess(res, { message: 'Expense fetched', data: expense });
});

const updateDraft = asyncHandler(async (req, res) => {
  const expense = await visitExpenseService.updateDraft(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Expense updated', data: expense });
});

const attachTicket = asyncHandler(async (req, res) => {
  const expense = await visitExpenseService.attachTicket(req.params.id, req.params.itemId, req.file, req.user);
  sendSuccess(res, { message: 'Ticket uploaded', data: expense });
});

const submit = asyncHandler(async (req, res) => {
  const expense = await visitExpenseService.submit(req.params.id, req.user);
  sendSuccess(res, { message: 'Expense submitted', data: expense });
});

const review = asyncHandler(async (req, res) => {
  const expense = await visitExpenseService.review(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Expense reviewed', data: expense });
});

module.exports = { list, getById, updateDraft, attachTicket, submit, review };
