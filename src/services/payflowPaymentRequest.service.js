const ExcelJS = require('exceljs');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { PayflowPaymentRequest, PayflowFund, PAYMENT_REQUEST_STATUSES } = require('../models/PayflowPaymentRequest.model');

// status -> statuses it may move to. Processed / Rejected are terminal.
const STATUS_TRANSITIONS = {
  Pending: ['Approved', 'Rejected', 'Query', 'Postponed'],
  Query: ['Pending', 'Approved', 'Rejected', 'Postponed'],
  Postponed: ['Pending', 'Approved', 'Rejected'],
  Approved: ['Processed', 'Rejected', 'Postponed'],
  Processed: [],
  Rejected: [],
};

const SORTABLE = ['createdAt', 'srNo', 'requestDate', 'company', 'vendor', 'category', 'amount', 'status'];
const SEARCHABLE = ['vendor', 'company', 'branch', 'category', 'subcategory', 'billNumber', 'description'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const populateUser = { path: 'requestedBy', select: 'name email' };

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, SORTABLE, { srNo: -1 });

  const filter = {};
  if (query.status && PAYMENT_REQUEST_STATUSES.includes(query.status)) filter.status = query.status;
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    const or = SEARCHABLE.map((field) => ({ [field]: regex }));
    if (/^\d+$/.test(query.search)) or.push({ srNo: Number(query.search) });
    filter.$or = or;
  }

  const [items, total] = await Promise.all([
    PayflowPaymentRequest.find(filter).sort(sort).skip(skip).limit(pageSize).populate(populateUser).exec(),
    PayflowPaymentRequest.countDocuments(filter),
  ]);
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const doc = await PayflowPaymentRequest.findById(id).populate(populateUser).populate({ path: 'history.by', select: 'name' });
  if (!doc) throw new ApiError(404, 'Payment request not found');
  return doc;
}

async function nextSrNo() {
  const last = await PayflowPaymentRequest.findOne().sort({ srNo: -1 }).select('srNo').lean();
  return (last?.srNo || 0) + 1;
}

async function create(body, actor) {
  const data = {
    company: body.company,
    branch: body.branch,
    vendor: body.vendor,
    category: body.category,
    subcategory: body.subcategory,
    itemType: body.itemType,
    description: body.description,
    billNumber: body.billNumber,
    billDate: body.billDate || null,
    totalOutstanding: body.totalOutstanding,
    payAgainst: body.payAgainst,
    bankName: body.bankName,
    paymentMode: body.paymentMode,
    amount: body.amount,
    priority: body.priority,
    priceCheckBy: body.priceCheckBy,
  };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  // Retry on the (unlikely) race where two requests grab the same serial number.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = await PayflowPaymentRequest.create({
        ...data,
        srNo: await nextSrNo(),
        requestedBy: actor._id,
        createdBy: actor._id,
        updatedBy: actor._id,
        history: [{ from: null, to: 'Pending', remark: 'Request created', by: actor._id }],
      });
      return getById(doc._id);
    } catch (err) {
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
  return null;
}

async function changeStatus(id, { status, remark }, actor) {
  const doc = await PayflowPaymentRequest.findById(id);
  if (!doc) throw new ApiError(404, 'Payment request not found');

  const allowed = STATUS_TRANSITIONS[doc.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(400, `A ${doc.status.toLowerCase()} request cannot be moved to ${status}`);
  }
  if (['Rejected', 'Query'].includes(status) && !String(remark || '').trim()) {
    throw new ApiError(400, `A remark is required to mark a request as ${status}`);
  }

  doc.history.push({ from: doc.status, to: status, remark: String(remark || '').trim(), by: actor._id });
  doc.status = status;
  doc.updatedBy = actor._id;
  await doc.save();
  return getById(doc._id);
}

async function addFund({ amount, note }, actor) {
  await PayflowFund.create({ amount, note, addedBy: actor._id });
  return stats();
}

// Payments counted against the fund: approved + processed requests dated yesterday or today.
async function stats() {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 1);
  periodStart.setHours(0, 0, 0, 0);

  const [byStatus, fundAgg, paymentAgg] = await Promise.all([
    PayflowPaymentRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    PayflowFund.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    PayflowPaymentRequest.aggregate([
      { $match: { status: { $in: ['Approved', 'Processed'] }, requestDate: { $gte: periodStart, $lte: periodEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const get = (s) => byStatus.find((r) => r._id === s) || { count: 0, amount: 0 };
  const totalRequests = byStatus.reduce((sum, r) => sum + r.count, 0);
  const totalFund = fundAgg[0]?.total || 0;
  const totalPayments = paymentAgg[0]?.total || 0;

  return {
    totalRequests,
    pendingApproval: get('Pending').count,
    pendingAmount: get('Pending').amount,
    approved: get('Approved').count,
    processed: get('Processed').count,
    rejected: get('Rejected').count,
    postponed: get('Postponed').count,
    query: get('Query').count,
    totalFund,
    totalPayments,
    netAvailable: totalFund - totalPayments,
    periodStart,
    periodEnd,
  };
}

// ---- Export -------------------------------------------------------------------------
const csvList = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// startDate / endDate are inclusive calendar days; statuses / companies are comma separated.
function buildExportFilter(query, { withStatus = true } = {}) {
  const filter = {};
  const range = {};
  if (query.startDate) {
    const start = new Date(query.startDate);
    if (Number.isNaN(start.getTime())) throw new ApiError(400, 'Invalid start date');
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }
  if (query.endDate) {
    const end = new Date(query.endDate);
    if (Number.isNaN(end.getTime())) throw new ApiError(400, 'Invalid end date');
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new ApiError(400, 'Start date must be before end date');
  if (Object.keys(range).length) filter.requestDate = range;

  const companies = csvList(query.companies);
  if (companies.length) filter.company = { $in: companies };

  if (withStatus) {
    const statuses = csvList(query.statuses).filter((s) => PAYMENT_REQUEST_STATUSES.includes(s));
    if (statuses.length) filter.status = { $in: statuses };
  }
  return filter;
}

// Counts per status for the date/company window, plus count + amount for the selected statuses.
async function exportSummary(query) {
  const base = buildExportFilter(query, { withStatus: false });
  const selected = csvList(query.statuses).filter((s) => PAYMENT_REQUEST_STATUSES.includes(s));
  const grouped = await PayflowPaymentRequest.aggregate([
    { $match: base },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);

  const counts = {};
  PAYMENT_REQUEST_STATUSES.forEach((s) => {
    counts[s] = grouped.find((g) => g._id === s)?.count || 0;
  });
  const included = selected.length ? grouped.filter((g) => selected.includes(g._id)) : grouped;
  return {
    counts,
    totalPayments: included.reduce((sum, g) => sum + g.count, 0),
    totalAmount: included.reduce((sum, g) => sum + g.amount, 0),
  };
}

async function exportWorkbook(query) {
  const rows = await PayflowPaymentRequest.find(buildExportFilter(query))
    .sort({ srNo: 1 })
    .populate(populateUser)
    .lean();
  if (!rows.length) throw new ApiError(404, 'No payments found for the selected filters');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payments');
  ws.columns = [
    { header: 'SR No.', key: 'srNo', width: 9 },
    { header: 'Date', key: 'requestDate', width: 13 },
    { header: 'Company', key: 'company', width: 16 },
    { header: 'Branch', key: 'branch', width: 12 },
    { header: 'Vendor', key: 'vendor', width: 30 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Subcategory', key: 'subcategory', width: 22 },
    { header: 'Item Type', key: 'itemType', width: 16 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Bill Number', key: 'billNumber', width: 18 },
    { header: 'Bill Date', key: 'billDate', width: 13 },
    { header: 'Pay Against', key: 'payAgainst', width: 16 },
    { header: 'Bank Name', key: 'bankName', width: 16 },
    { header: 'Payment Mode', key: 'paymentMode', width: 16 },
    { header: 'Total Outstanding', key: 'totalOutstanding', width: 18 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Requested By', key: 'requestedBy', width: 20 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, requestedBy: r.requestedBy?.name || '' }));

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D3BFF' } };
  ['requestDate', 'billDate'].forEach((k) => { ws.getColumn(k).numFmt = 'dd/mm/yyyy'; });
  ['totalOutstanding', 'amount'].forEach((k) => { ws.getColumn(k).numFmt = '#,##0.00'; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const total = ws.addRow({ vendor: 'Total', amount: rows.reduce((s, r) => s + (r.amount || 0), 0) });
  total.font = { bold: true };
  return wb.xlsx.writeBuffer();
}

module.exports = { list, getById, create, changeStatus, stats, addFund, exportSummary, exportWorkbook, STATUS_TRANSITIONS };
