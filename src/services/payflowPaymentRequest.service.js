const ExcelJS = require('exceljs');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { PayflowPaymentRequest, PayflowFund, PAYMENT_REQUEST_STATUSES } = require('../models/PayflowPaymentRequest.model');
const { PayflowVendor } = require('../models/Payflow.model');
const User = require('../models/User.model');
const { USER_STATUS } = require('../config/constants');

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

// `scope.ownerId` limits results to requests submitted by that user (Payflow users).
async function list(query, scope = {}) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, SORTABLE, { srNo: -1 });

  const filter = {};
  if (scope.ownerId) filter.requestedBy = scope.ownerId;
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

async function getById(id, scope = {}) {
  const doc = await PayflowPaymentRequest.findById(id)
    .populate(populateUser)
    .populate('quantityCheckedBy.user', 'name email')
    .populate('qualityCheckedBy.user', 'name email')
    .populate('purchaseOwner.user', 'name email')
    .populate('priceCheckBy.user', 'name email')
    .populate({
      path: 'history.by',
      select: 'name'
    });

  if (!doc) {
    throw new ApiError(404, 'Payment request not found');
  }

  if (
    scope.ownerId &&
    String(doc.requestedBy?._id || doc.requestedBy) !== String(scope.ownerId)
  ) {
    throw new ApiError(404, 'Payment request not found');
  }

  return doc;
}

// Active users for the "Select user" dropdowns (price / quantity / quality check, purchase owner).
async function userOptions() {
  return User.find({ status: USER_STATUS.ACTIVE }).select('name email').sort({ name: 1 }).lean();
}

async function nextSrNo() {
  const last = await PayflowPaymentRequest.findOne().sort({ srNo: -1 }).select('srNo').lean();
  return (last?.srNo || 0) + 1;
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v);

// Normalises a { user, name, email } picker value; returns undefined when nothing was chosen.
function toPerson(value) {
  if (!value || !(value.name || value.user)) return undefined;
  return { user: value.user || null, name: clean(value.name) || '', email: clean(value.email) || '' };
}

async function create(body, actor) {
  const bills = (Array.isArray(body.bills) ? body.bills : [])
    .filter((b) => b && clean(b.billNumber) && b.billDate)
    .map((b) => ({ billNumber: clean(b.billNumber), billDate: b.billDate }));
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => a && a.url)
    .map((a) => ({ url: a.url, publicId: a.publicId || '', name: clean(a.name) || '' }));

  const totalOutstanding = Number(body.totalOutstanding) || 0;
  const amount = Number(body.amount) || 0;

  const data = {
    company: body.company,
    branch: body.branch,
    vendor: body.vendor,
    vendorAccountNumber: body.vendorAccountNumber,
    vendorIfsc: body.vendorIfsc,
    category: body.category,
    subcategory: body.subcategory,
    itemType: body.itemType,
    description: body.description,
    bills,
    billNumber: bills[0]?.billNumber ?? body.billNumber,
    billDate: bills[0]?.billDate || body.billDate || null,
    attachments,
    totalOutstanding,
    // Never trust a client-supplied balance.
    balanceAmount: Math.max(totalOutstanding - amount, 0),
    payAgainst: body.payAgainst,
    bankName: body.bankName,
    paymentMode: body.paymentMode,
    amount: body.amount,
    priority: body.priority,
    priceCheckBy: toPerson(body.priceCheckBy),
    quantityCheckedBy: toPerson(body.quantityCheckedBy),
    qualityCheckedBy: toPerson(body.qualityCheckedBy),
    purchaseOwner: toPerson(body.purchaseOwner),
    department: body.department,
    endUse: body.endUse,
    lpr: body.lpr,
    ioa: body.ioa,
    cpp: body.cpp === '' || body.cpp == null ? undefined : Number(body.cpp),
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
  const [rows, fundAgg] = await Promise.all([
    PayflowPaymentRequest.find(buildExportFilter(query))
      .sort({ srNo: 1 })
      .populate(populateUser)
      .lean(),
    PayflowFund.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  if (!rows.length) throw new ApiError(404, 'No payments found for the selected filters');

  // Backfill accountNumber / ifscCode from PayflowVendor master if missing on the request
  const missingVendorNames = [
    ...new Set(
      rows
        .filter((r) => (!r.vendorAccountNumber || !r.vendorIfsc) && r.vendor)
        .map((r) => r.vendor.trim().toUpperCase())
    ),
  ];
  const vendorMap = new Map();
  if (missingVendorNames.length) {
    const vendors = await PayflowVendor.find({ name: { $in: missingVendorNames } })
      .select('name accountNumber ifscCode')
      .lean();
    vendors.forEach((v) => vendorMap.set(v.name.trim().toUpperCase(), v));
  }

  const totalFund = fundAgg[0]?.total || 0;
  const totalPayments = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const netAvailable = totalFund - totalPayments;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payments');

  ws.columns = [
    { key: 'srNo', width: 9 },
    { key: 'company', width: 14 },
    { key: 'vendor', width: 34 },
    { key: 'accountNo', width: 22 },
    { key: 'ifsc', width: 16 },
    { key: 'amount', width: 14 },
    { key: 'totalOutstanding', width: 14 },
    { key: 'description', width: 40 },
    { key: 'itemType', width: 16 },
    { key: 'urgency', width: 12 },
    { key: 'department', width: 16 },
    { key: 'endUse', width: 16 },
    { key: 'payAgainst', width: 16 },
    { key: 'status', width: 12 },
    { key: 'requestedBy', width: 18 },
    { key: 'valueDate', width: 14 },
  ];

  // Rows 1-3: Top summary block
  const r1 = ws.addRow(['Total Fund', totalFund]);
  r1.getCell(1).font = { bold: true };
  r1.getCell(2).numFmt = '#,##0';

  const r2 = ws.addRow(['Total Payments', totalPayments]);
  r2.getCell(1).font = { bold: true };
  r2.getCell(2).numFmt = '#,##0';

  const r3 = ws.addRow(['Net Available', netAvailable]);
  r3.getCell(1).font = { bold: true };
  r3.getCell(2).numFmt = '#,##0';
  r3.getCell(2).font = {
    bold: true,
    color: { argb: netAvailable < 0 ? 'FFFF0000' : 'FF15803D' },
  };

  // Row 4: Blank row
  ws.addRow([]);

  // Row 5: Table header row
  const headers = [
    'SR NO',
    'COMP',
    'PARTY',
    'ACCOUNTNO',
    'IFSC',
    'AMOUNT',
    'Tota O/s',
    'DESCRIPION',
    'Item Type',
    'Urgency',
    'Department',
    'End Use',
    'Pay Agst',
    'Status',
    'Requested by',
    'Value Date',
  ];
  const head = ws.addRow(headers);
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D3BFF' } };
  });

  const formatDateDdMmYyyy = (d) => {
    if (!d) return '';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const formatPayAgainst = (val) => {
    if (!val) return '';
    return String(val).replace(/_/g, ' ');
  };

  const URGENCY_COLORS = {
    High: 'FFD32F2F',
    Medium: 'FFED6C02',
    Low: 'FF2E7D32',
  };

  rows.forEach((r, idx) => {
    const vLookup = r.vendor ? vendorMap.get(r.vendor.trim().toUpperCase()) : null;
    const accountNo = r.vendorAccountNumber || vLookup?.accountNumber || '';
    const ifsc = r.vendorIfsc || vLookup?.ifscCode || '';
    const urgency = r.priority || 'Medium';

    const row = ws.addRow({
      srNo: idx + 1,
      company: r.company || '',
      vendor: r.vendor || '',
      accountNo: accountNo ? String(accountNo) : '',
      ifsc: ifsc ? String(ifsc) : '',
      amount: Number(r.amount) || 0,
      totalOutstanding: Number(r.totalOutstanding) || 0,
      description: r.description || '',
      itemType: r.itemType || '',
      urgency,
      department: r.department && r.department.trim() ? r.department.trim() : 'N/A',
      endUse: r.endUse && r.endUse.trim() ? r.endUse.trim() : 'N/A',
      payAgainst: formatPayAgainst(r.payAgainst),
      status: r.status || '',
      requestedBy: r.requestedBy?.name || 'N/A',
      valueDate: formatDateDdMmYyyy(r.requestDate || r.createdAt),
    });

    const urgencyCell = row.getCell('urgency');
    const urgencyBg = URGENCY_COLORS[urgency];
    if (urgencyBg) {
      urgencyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: urgencyBg } };
      urgencyCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    urgencyCell.alignment = { horizontal: 'center' };
  });

  return wb.xlsx.writeBuffer();
}

module.exports = { list, getById, userOptions, create, changeStatus, stats, addFund, exportSummary, exportWorkbook, STATUS_TRANSITIONS };
