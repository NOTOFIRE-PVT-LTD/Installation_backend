const ContractorAttendance = require('../models/ContractorAttendance.model');
const ApiError = require('../utils/ApiError');
const { parseContractorWorkbook } = require('../utils/contractorExcelParser');
const { generateContractorTemplate } = require('../utils/contractorTemplate');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

function createBatchId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BATCH-${stamp}-${rand}`;
}

async function uploadExcel(file, user, options = {}) {
  if (!file || !file.buffer) throw new ApiError(400, 'Excel file is required');
  const batchId = createBatchId();
  const rows = await parseContractorWorkbook(file, {
    batchId,
    monthYear: options.monthYear,
    uploadedBy: user?._id || null,
  });

  if (rows.length === 0) {
    throw new ApiError(400, 'No valid worker attendance rows found in the spreadsheet');
  }

  await ContractorAttendance.insertMany(rows);
  const totalWages = rows.reduce((sum, r) => sum + (r.wages || 0), 0);
  const uniqueContractors = new Set(rows.map((r) => r.contractorName)).size;

  return {
    batchId,
    fileName: file.originalname,
    insertedCount: rows.length,
    contractorsCount: uniqueContractors,
    totalWages,
    sampleRows: rows.slice(0, 10),
  };
}

function buildListFilter(query) {
  const filter = {};
  if (query.contractor) filter.contractorName = new RegExp(String(query.contractor).trim(), 'i');
  if (query.monthYear) filter.monthYear = new RegExp(String(query.monthYear).trim(), 'i');
  if (query.site) filter.siteLocation = new RegExp(String(query.site).trim(), 'i');
  if (query.batchId) filter.batchId = query.batchId;
  if (query.search) {
    const rx = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ workerName: rx }, { contractorName: rx }, { workerId: rx }, { siteLocation: rx }];
  }
  return filter;
}

async function fetchStats(filter) {
  const agg = await ContractorAttendance.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalWages: { $sum: '$wages' },
        totalDays: { $sum: '$presentDays' },
        contractors: { $addToSet: '$contractorName' },
      },
    },
  ]);
  const row = agg[0] || {};
  return {
    totalWages: row.totalWages || 0,
    totalDays: row.totalDays || 0,
    totalContractors: row.contractors?.length || 0,
  };
}

async function list(query = {}) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ['contractorName', 'workerName', 'presentDays', 'wages', 'createdAt']);
  const filter = buildListFilter(query);

  const [items, total, stats, distinctContractors, distinctMonths] = await Promise.all([
    ContractorAttendance.find(filter).sort(sort).skip(skip).limit(pageSize).lean(),
    ContractorAttendance.countDocuments(filter),
    fetchStats(filter),
    ContractorAttendance.distinct('contractorName'),
    ContractorAttendance.distinct('monthYear'),
  ]);

  return {
    ...buildPaginatedResult({ items, total, page, pageSize }),
    summary: { totalWorkers: total, ...stats },
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

module.exports = {
  uploadExcel,
  list,
  deleteRecord,
  deleteBatch,
  generateSampleTemplate: generateContractorTemplate,
};
