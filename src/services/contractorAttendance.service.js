const ExcelJS = require('exceljs');
const ContractorAttendance = require('../models/ContractorAttendance.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

function cellValueToString(val) {
  if (val == null) return '';
  if (typeof val === 'object') {
    if (val.text != null) return String(val.text).trim();
    if (val.result != null) return String(val.result).trim();
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
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
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function uploadExcel(file, user, options = {}) {
  if (!file || !file.buffer) {
    throw new ApiError(400, 'Excel file is required');
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch (err) {
    throw new ApiError(400, 'Invalid or corrupt Excel spreadsheet (.xlsx/.xls)');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ApiError(400, 'Workbook is empty. Please upload an Excel sheet with data.');
  }

  // Find header row (usually row 1, or first row with text)
  let headerRowIndex = 1;
  let headerMap = {};

  worksheet.eachRow((row, rowNumber) => {
    if (Object.keys(headerMap).length > 0) return;
    const map = {};
    row.eachCell((cell, colNumber) => {
      const txt = normalizeHeader(cellValueToString(cell.value));
      if (txt) map[txt] = colNumber;
    });
    // Check if row has at least worker/employee or contractor or wages
    const hasKeyColumns = Object.keys(map).some(
      (k) =>
        k.includes('worker') ||
        k.includes('employee') ||
        k.includes('name') ||
        k.includes('contractor') ||
        k.includes('wage') ||
        k.includes('attendance')
    );
    if (hasKeyColumns) {
      headerRowIndex = rowNumber;
      headerMap = map;
    }
  });

  if (Object.keys(headerMap).length === 0) {
    throw new ApiError(400, 'Could not detect column headers. Please ensure the Excel has column headers.');
  }

  const findCol = (...patterns) => {
    for (const pat of patterns) {
      const norm = normalizeHeader(pat);
      for (const [header, col] of Object.entries(headerMap)) {
        if (header.includes(norm) || norm.includes(header)) return col;
      }
    }
    return null;
  };

  const colContractor = findCol('contractor', 'agency', 'vendor');
  const colWorker = findCol('workername', 'employeename', 'worker', 'employee', 'labourname', 'name');
  const colWorkerId = findCol('workerid', 'empid', 'id', 'badge', 'code', 'cardno', 'aadhaar');
  const colCategory = findCol('category', 'skill', 'skilllevel', 'designation', 'trade', 'role');
  const colSite = findCol('site', 'sitelocation', 'project', 'location', 'plant', 'unit');
  const colMonth = findCol('month', 'period', 'date');
  const colDays = findCol('presentdays', 'present', 'daysworked', 'workingdays', 'duty', 'days', 'attendance');
  const colOt = findCol('overtime', 'othours', 'othrs', 'ot');
  const colRate = findCol('dailyrate', 'rate', 'perday', 'wagerate', 'dailywage');
  const colWages = findCol('totalwages', 'wages', 'totalwage', 'grosswages', 'netwages', 'amount', 'totalamount', 'netpay');
  const colRemarks = findCol('remarks', 'remark', 'notes', 'status');

  const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const extractedRows = [];
  const defaultMonthYear = options.monthYear || new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return;

    const workerName = colWorker ? cellValueToString(row.getCell(colWorker).value) : '';
    const contractorName = colContractor ? cellValueToString(row.getCell(colContractor).value) : 'General Contractor';

    // If both worker name and contractor are blank, skip empty row
    if (!workerName && (!colContractor || !contractorName)) return;

    const workerId = colWorkerId ? cellValueToString(row.getCell(colWorkerId).value) : '';
    const category = colCategory ? cellValueToString(row.getCell(colCategory).value) : 'Skilled';
    const siteLocation = colSite ? cellValueToString(row.getCell(colSite).value) : 'Main Site';
    const monthYear = colMonth ? cellValueToString(row.getCell(colMonth).value) || defaultMonthYear : defaultMonthYear;
    const presentDays = colDays ? cellValueToNumber(row.getCell(colDays).value, 0) : 0;
    const overtimeHours = colOt ? cellValueToNumber(row.getCell(colOt).value, 0) : 0;
    const dailyRate = colRate ? cellValueToNumber(row.getCell(colRate).value, 0) : 0;

    let wages = colWages ? cellValueToNumber(row.getCell(colWages).value, 0) : 0;
    // Auto-calculate wages if not provided in Excel
    if (wages <= 0 && presentDays > 0 && dailyRate > 0) {
      const otWage = dailyRate > 0 ? (dailyRate / 8) * overtimeHours : 0;
      wages = Math.round(presentDays * dailyRate + otWage);
    }

    const remarks = colRemarks ? cellValueToString(row.getCell(colRemarks).value) : '';

    extractedRows.push({
      batchId,
      fileName: file.originalname || 'attendance.xlsx',
      monthYear,
      contractorName: contractorName || 'General Contractor',
      workerName: workerName || `Worker #${extractedRows.length + 1}`,
      workerId,
      category: category || 'General',
      siteLocation: siteLocation || 'Main Site',
      presentDays,
      overtimeHours,
      dailyRate,
      wages,
      paymentStatus: 'Pending',
      remarks,
      uploadedBy: user?._id || null,
    });
  });

  if (extractedRows.length === 0) {
    throw new ApiError(400, 'No valid worker attendance rows found under the headers');
  }

  // Bulk insert records
  await ContractorAttendance.insertMany(extractedRows);

  const totalWages = extractedRows.reduce((sum, r) => sum + (r.wages || 0), 0);
  const uniqueContractors = new Set(extractedRows.map((r) => r.contractorName)).size;

  return {
    batchId,
    fileName: file.originalname,
    insertedCount: extractedRows.length,
    contractorsCount: uniqueContractors,
    totalWages,
    sampleRows: extractedRows.slice(0, 10),
  };
}

async function list(query = {}) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ['contractorName', 'workerName', 'presentDays', 'wages', 'createdAt', 'monthYear']);

  const filter = {};
  if (query.contractor) {
    filter.contractorName = new RegExp(String(query.contractor).trim(), 'i');
  }
  if (query.monthYear) {
    filter.monthYear = new RegExp(String(query.monthYear).trim(), 'i');
  }
  if (query.site) {
    filter.siteLocation = new RegExp(String(query.site).trim(), 'i');
  }
  if (query.batchId) {
    filter.batchId = query.batchId;
  }
  if (query.search) {
    const rx = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { workerName: rx },
      { contractorName: rx },
      { workerId: rx },
      { siteLocation: rx },
      { category: rx },
    ];
  }

  const [items, total, statsAgg] = await Promise.all([
    ContractorAttendance.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .populate('uploadedBy', 'name email')
      .lean(),
    ContractorAttendance.countDocuments(filter),
    ContractorAttendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalWages: { $sum: '$wages' },
          totalDays: { $sum: '$presentDays' },
          contractors: { $addToSet: '$contractorName' },
        },
      },
    ]),
  ]);

  const distinctContractors = await ContractorAttendance.distinct('contractorName');
  const distinctMonths = await ContractorAttendance.distinct('monthYear');

  const totals = statsAgg[0] || { totalWages: 0, totalDays: 0, contractors: [] };

  return {
    ...buildPaginatedResult({ items, total, page, pageSize }),
    summary: {
      totalWorkers: total,
      totalWages: totals.totalWages || 0,
      totalDays: totals.totalDays || 0,
      totalContractors: totals.contractors?.length || 0,
    },
    filterOptions: {
      contractors: distinctContractors.filter(Boolean).sort(),
      months: distinctMonths.filter(Boolean).sort(),
    },
  };
}

async function deleteRecord(id) {
  const deleted = await ContractorAttendance.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Record not found');
  return deleted;
}

async function deleteBatch(batchId) {
  const result = await ContractorAttendance.deleteMany({ batchId });
  return { deletedCount: result.deletedCount };
}

async function generateSampleTemplate(res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Valuecon Workforce HR';
  const sheet = workbook.addWorksheet('Contractor Attendance', {
    views: [{ showGridLines: true }],
  });

  sheet.columns = [
    { header: 'Contractor Name', key: 'contractorName', width: 26 },
    { header: 'Worker Name', key: 'workerName', width: 22 },
    { header: 'Worker ID', key: 'workerId', width: 14 },
    { header: 'Category / Trade', key: 'category', width: 18 },
    { header: 'Site Location', key: 'siteLocation', width: 22 },
    { header: 'Month / Period', key: 'monthYear', width: 16 },
    { header: 'Present Days', key: 'presentDays', width: 14 },
    { header: 'OT Hours', key: 'overtimeHours', width: 12 },
    { header: 'Daily Rate (INR)', key: 'dailyRate', width: 16 },
    { header: 'Total Wages (INR)', key: 'wages', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 20 },
  ];

  // Header styling: rich gold background with dark brown text
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF3A230B' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5E2B3' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  // Sample data rows
  const samples = [
    {
      contractorName: 'Apex Manpower Services',
      workerName: 'Ramesh Kumar',
      workerId: 'CW-1001',
      category: 'Electrician',
      siteLocation: 'Noida Plant Phase 2',
      monthYear: 'Nov 2026',
      presentDays: 26,
      overtimeHours: 8,
      dailyRate: 750,
      wages: 20250,
      remarks: 'Verified by Site In-charge',
    },
    {
      contractorName: 'Apex Manpower Services',
      workerName: 'Suresh Chauhan',
      workerId: 'CW-1002',
      category: 'Fitter',
      siteLocation: 'Noida Plant Phase 2',
      monthYear: 'Nov 2026',
      presentDays: 24,
      overtimeHours: 0,
      dailyRate: 700,
      wages: 16800,
      remarks: 'Full attendance',
    },
    {
      contractorName: 'Shree Ram Labour Co.',
      workerName: 'Mohd. Imran',
      workerId: 'SR-2041',
      category: 'Welder',
      siteLocation: 'Delhi Metro Station D-4',
      monthYear: 'Nov 2026',
      presentDays: 25,
      overtimeHours: 12,
      dailyRate: 800,
      wages: 21200,
      remarks: 'Night shift OT included',
    },
    {
      contractorName: 'Shree Ram Labour Co.',
      workerName: 'Vijay Pal',
      workerId: 'SR-2042',
      category: 'Helper',
      siteLocation: 'Delhi Metro Station D-4',
      monthYear: 'Nov 2026',
      presentDays: 22,
      overtimeHours: 4,
      dailyRate: 500,
      wages: 11250,
      remarks: 'Standard wage',
    },
  ];

  samples.forEach((sample) => {
    const row = sheet.addRow(sample);
    row.alignment = { vertical: 'middle' };
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Contractor_Attendance_Template.xlsx"'
  );

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = {
  uploadExcel,
  list,
  deleteRecord,
  deleteBatch,
  generateSampleTemplate,
};

