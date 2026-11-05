const ExcelJS = require('exceljs');
const ApiError = require('./ApiError');

function cellValueToString(val) {
  if (val == null) return '';
  if (typeof val === 'object') {
    if (val.text != null) return String(val.text).trim();
    if (val.result != null) return String(val.result).trim();
    if (val instanceof Date) return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

function cellValueToNumber(val, fallback = 0) {
  if (val == null) return fallback;
  if (typeof val === 'object' && val.result != null) {
    const num = Number(val.result);
    return Number.isFinite(num) ? num : fallback;
  }
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = Number(clean);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeHeader(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectHeaderMap(worksheet) {
  let headerRowIndex = 1;
  let headerMap = {};
  worksheet.eachRow((row, rowNumber) => {
    if (Object.keys(headerMap).length > 0) return;
    const map = {};
    row.eachCell((cell, colNumber) => {
      const txt = normalizeHeader(cellValueToString(cell.value));
      if (txt) map[txt] = colNumber;
    });
    const hasKeys = Object.keys(map).some(
      (k) => k.includes('worker') || k.includes('contractor') || k.includes('wage') || k.includes('attendance')
    );
    if (hasKeys) {
      headerRowIndex = rowNumber;
      headerMap = map;
    }
  });
  return { headerRowIndex, headerMap };
}

function matchColumn(headerMap, ...patterns) {
  for (const pat of patterns) {
    const norm = normalizeHeader(pat);
    for (const [header, col] of Object.entries(headerMap)) {
      if (header.includes(norm) || norm.includes(header)) return col;
    }
  }
  return null;
}

function resolveColumnIndices(headerMap) {
  return {
    contractor: matchColumn(headerMap, 'contractor', 'agency', 'vendor'),
    worker: matchColumn(headerMap, 'workername', 'employeename', 'worker', 'employee', 'name'),
    workerId: matchColumn(headerMap, 'workerid', 'empid', 'id', 'badge', 'code'),
    category: matchColumn(headerMap, 'category', 'skill', 'skilllevel', 'designation'),
    site: matchColumn(headerMap, 'site', 'sitelocation', 'project', 'location'),
    month: matchColumn(headerMap, 'month', 'period', 'date'),
    days: matchColumn(headerMap, 'presentdays', 'present', 'daysworked', 'workingdays', 'days'),
    ot: matchColumn(headerMap, 'overtime', 'othours', 'othrs', 'ot'),
    rate: matchColumn(headerMap, 'dailyrate', 'rate', 'perday', 'wagerate'),
    wages: matchColumn(headerMap, 'totalwages', 'wages', 'totalwage', 'grosswages', 'amount'),
    remarks: matchColumn(headerMap, 'remarks', 'remark', 'notes', 'status'),
  };
}

function calculateWages(rawWage, days, rate, ot) {
  if (rawWage > 0) return rawWage;
  if (days > 0 && rate > 0) {
    const otWage = (rate / 8) * (ot || 0);
    return Math.round(days * rate + otWage);
  }
  return 0;
}

function parseRowData(row, cols, meta) {
  const workerName = cols.worker ? cellValueToString(row.getCell(cols.worker).value) : '';
  const contractorName = cols.contractor ? cellValueToString(row.getCell(cols.contractor).value) : 'General Contractor';
  if (!workerName && !contractorName) return null;

  const days = cols.days ? cellValueToNumber(row.getCell(cols.days).value, 0) : 0;
  const rate = cols.rate ? cellValueToNumber(row.getCell(cols.rate).value, 0) : 0;
  const ot = cols.ot ? cellValueToNumber(row.getCell(cols.ot).value, 0) : 0;
  const rawWage = cols.wages ? cellValueToNumber(row.getCell(cols.wages).value, 0) : 0;

  return {
    batchId: meta.batchId,
    fileName: meta.fileName,
    monthYear: cols.month ? cellValueToString(row.getCell(cols.month).value) || meta.monthYear : meta.monthYear,
    contractorName: contractorName || 'General Contractor',
    workerName: workerName || 'Worker',
    workerId: cols.workerId ? cellValueToString(row.getCell(cols.workerId).value) : '',
    category: cols.category ? cellValueToString(row.getCell(cols.category).value) : 'General',
    siteLocation: cols.site ? cellValueToString(row.getCell(cols.site).value) : 'Main Site',
    presentDays: days,
    overtimeHours: ot,
    dailyRate: rate,
    wages: calculateWages(rawWage, days, rate, ot),
    paymentStatus: 'Pending',
    remarks: cols.remarks ? cellValueToString(row.getCell(cols.remarks).value) : '',
    uploadedBy: meta.uploadedBy,
  };
}

async function parseContractorWorkbook(file, options = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, 'Uploaded spreadsheet is empty');

  const { headerRowIndex, headerMap } = detectHeaderMap(worksheet);
  if (Object.keys(headerMap).length === 0) {
    throw new ApiError(400, 'Could not detect column headers in spreadsheet');
  }

  const cols = resolveColumnIndices(headerMap);
  const meta = {
    batchId: options.batchId,
    fileName: file.originalname || 'attendance.xlsx',
    monthYear: options.monthYear || new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
    uploadedBy: options.uploadedBy,
  };

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return;
    const item = parseRowData(row, cols, meta);
    if (item && item.workerName) rows.push(item);
  });
  return rows;
}

module.exports = { parseContractorWorkbook };
