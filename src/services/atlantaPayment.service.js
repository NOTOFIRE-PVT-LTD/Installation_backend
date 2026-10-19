const atlantaPaymentRepository = require('../repositories/atlantaPayment.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');

const MAX_PAGE_SIZE = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// TADA (travelling + daily allowance) paid per travel day.
const TADA_RATE_PER_DAY = 1200;

const EXPENSE_FIELDS = [
  'sseAmount',
  'sseBabu',
  'meggeringCharge',
  'adste',
  'budgetAccounts',
  'dyCsteOs',
  'dyCste',
  'miscellaneous',
];

function text(value) {
  return String(value ?? '').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(n, 0) : 0;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole travel days between leaving and exiting the destination; a started day counts as a day. */
function computeTravelDays(start, end) {
  if (!start || !end) return 0;
  const diff = end.getTime() - start.getTime();
  return diff > 0 ? Math.ceil(diff / MS_PER_DAY) : 0;
}

function buildInvoiceEntries(raw) {
  return (Array.isArray(raw) ? raw : []).map((row) => {
    const entry = {
      invoiceNoDate: text(row.invoiceNoDate),
      basicAmount: num(row.basicAmount),
      quantity: num(row.quantity),
      totalAmount: num(row.totalAmount),
      miscRecipientName: text(row.miscRecipientName),
    };
    EXPENSE_FIELDS.forEach((key) => {
      entry[key] = num(row[key]);
    });
    entry.totalExpense = round2(EXPENSE_FIELDS.reduce((sum, key) => sum + entry[key], 0));
    return entry;
  });
}

function buildPaymentsReceived(raw) {
  return (Array.isArray(raw) ? raw : []).map((row) => ({
    paymentDate: toDate(row.paymentDate),
    amount: num(row.amount),
    deductAmount: num(row.deductAmount),
    details: text(row.details),
  }));
}

async function uploadProof(file) {
  const uploaded = await uploadService.uploadCadFile(file);
  return {
    url: uploaded.url,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
  };
}

async function deleteProofs(proofs = []) {
  await Promise.all(
    proofs
      .filter((proof) => proof?.publicId)
      .map((proof) => uploadService.deleteAsset(proof.publicId, proof.resourceType || 'image'))
  );
}

/**
 * Each travel expense either keeps an existing proof (`keepProofId`), takes a newly uploaded file
 * (`newProofIndex` into the uploaded files) or has no proof.
 */
async function buildTravelExpenses(raw, files, existingExpenses = []) {
  const existingProofs = new Map();
  existingExpenses.forEach((expense) => {
    if (expense.proof?._id) existingProofs.set(String(expense.proof._id), expense.proof);
  });

  const keptIds = new Set();
  const uploaded = [];
  const expenses = [];

  try {
    for (const row of Array.isArray(raw) ? raw : []) {
      let proof = null;
      const index = row.newProofIndex;
      if (Number.isInteger(index) && files[index]) {
        proof = await uploadProof(files[index]);
        uploaded.push(proof);
      } else if (row.keepProofId && existingProofs.has(String(row.keepProofId)) && !keptIds.has(String(row.keepProofId))) {
        keptIds.add(String(row.keepProofId));
        proof = existingProofs.get(String(row.keepProofId)).toObject();
      }
      expenses.push({
        date: toDate(row.date),
        detail: text(row.detail),
        amount: num(row.amount),
        proof,
        transactionDone: Boolean(row.transactionDone),
      });
    }
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }

  const dropped = [...existingProofs.entries()].filter(([id]) => !keptIds.has(id)).map(([, proof]) => proof);
  return { expenses, uploaded, dropped };
}

function validate(data) {
  if (!text(data.fileName)) throw new ApiError(400, 'File Name / Record Name is required');
  if (!text(data.employeeName)) throw new ApiError(400, 'Employee Name is required');
}

/** All totals are recomputed here so the stored numbers never depend on what the client sent. */
function buildFields(data, invoiceEntries, travelExpenses, paymentsReceived) {
  const travelStartAt = toDate(data.travelStartAt);
  const reachedAt = toDate(data.reachedAt);
  const exitAt = toDate(data.exitAt);
  const travelDays = computeTravelDays(travelStartAt, exitAt);
  const totalTada = round2(travelDays * TADA_RATE_PER_DAY);

  const totalBasicAmount = round2(invoiceEntries.reduce((sum, row) => sum + row.basicAmount, 0));
  const totalInvoiceAmount = round2(invoiceEntries.reduce((sum, row) => sum + row.totalAmount, 0));
  const totalExpense = round2(invoiceEntries.reduce((sum, row) => sum + row.totalExpense, 0));
  const totalTravelExpenses = round2(travelExpenses.reduce((sum, row) => sum + row.amount, 0));
  // A deduction is withheld from what was received, so only the net counts as received.
  const totalReceivedAmount = round2(paymentsReceived.reduce((sum, row) => sum + Math.max(row.amount - row.deductAmount, 0), 0));

  return {
    fileName: text(data.fileName),
    consigneeName: text(data.consigneeName),
    crnDate: toDate(data.crnDate),
    paymentDate: toDate(data.paymentDate),
    employeeName: text(data.employeeName),
    designation: text(data.designation),
    travelStartAt,
    reachedAt,
    exitAt,
    travelDays,
    ratePerDay: TADA_RATE_PER_DAY,
    totalTada,
    invoiceEntries,
    totalBasicAmount,
    totalInvoiceAmount,
    totalExpense,
    travelExpenses,
    totalTravelExpenses,
    paymentsReceived,
    totalReceivedAmount,
    amountToGive: round2(totalTada + totalExpense + totalTravelExpenses - totalReceivedAmount),
  };
}

async function listAtlantaPayments(query = {}) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: MAX_PAGE_SIZE });
  const filter = {};
  const terms = text(query.search).split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return { $or: [{ fileName: regex }, { consigneeName: regex }, { employeeName: regex }, { designation: regex }] };
    });
  }
  const { items, total } = await atlantaPaymentRepository.paginate({
    filter,
    sort: { createdAt: -1 },
    skip,
    limit: pageSize,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getAtlantaPaymentById(id) {
  const payment = await atlantaPaymentRepository.findById(id);
  if (!payment) throw new ApiError(404, 'Payment entry not found');
  return payment;
}

async function createAtlantaPayment(data, files = [], actorId) {
  validate(data);
  const invoiceEntries = buildInvoiceEntries(data.invoiceEntries);
  const paymentsReceived = buildPaymentsReceived(data.paymentsReceived);
  const { expenses, uploaded } = await buildTravelExpenses(data.travelExpenses, files);

  try {
    return await atlantaPaymentRepository.create({
      ...buildFields(data, invoiceEntries, expenses, paymentsReceived),
      createdBy: actorId,
      updatedBy: actorId,
    });
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }
}

async function updateAtlantaPayment(id, data, files = [], actorId) {
  const existing = await getAtlantaPaymentById(id);
  validate(data);
  const invoiceEntries = buildInvoiceEntries(data.invoiceEntries);
  const paymentsReceived = buildPaymentsReceived(data.paymentsReceived);
  const { expenses, uploaded, dropped } = await buildTravelExpenses(data.travelExpenses, files, existing.travelExpenses);

  let saved;
  try {
    saved = await atlantaPaymentRepository.updateById(id, {
      ...buildFields(data, invoiceEntries, expenses, paymentsReceived),
      updatedBy: actorId,
    });
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }
  await deleteProofs(dropped);
  return saved;
}

async function removeAtlantaPayment(id) {
  const existing = await getAtlantaPaymentById(id);
  await atlantaPaymentRepository.deleteById(id);
  await deleteProofs(existing.travelExpenses.map((expense) => expense.proof));
}

module.exports = {
  listAtlantaPayments,
  getAtlantaPaymentById,
  createAtlantaPayment,
  updateAtlantaPayment,
  removeAtlantaPayment,
};
