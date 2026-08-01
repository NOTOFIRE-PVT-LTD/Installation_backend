const financialDocumentRepository = require('../repositories/financialDocument.repository');
const nitTenderRepository = require('../repositories/nitTender.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { LOA_TYPES } = require('../config/constants');

const ALLOWED_SORT_FIELDS = [
  'bgNumber',
  'partyName',
  'bgAmount',
  'tenderName',
  'loaNumber',
  'loaDate',
  'bgDeadline21',
  'bgDeadline60',
  'bgDispatch',
  'bgSubmission',
  'bgVerify',
  'createdAt',
];

const POPULATE = [
  {
    path: 'tender',
    select: 'tenderName nitNumber loaNumber loaDate loaValue loaDivisionName contractorName',
  },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

function addDays(dateValue, days) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function computeDeadlines(loaDate) {
  return {
    bgDeadline21: addDays(loaDate, 21),
    bgDeadline60: addDays(loaDate, 60),
  };
}

async function resolveTender(tenderId) {
  if (!tenderId) throw new ApiError(400, 'Tender is required');
  const tender = await nitTenderRepository.findById(tenderId);
  if (!tender) throw new ApiError(404, 'Tender not found');
  if (!tender.loaNumber) throw new ApiError(400, 'Selected tender has no LOA Number');
  if (!tender.loaDate) throw new ApiError(400, 'Selected tender has no LOA Date. Please set LOA Date in Tender first.');
  return tender;
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.tender) filter.tender = query.tender;
  if (query.partyName) filter.partyName = query.partyName;

  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ bgNumber: regex }, { tenderName: regex }, { loaNumber: regex }, { partyName: regex }];
  }

  const { items, total } = await financialDocumentRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function options() {
  const items = await financialDocumentRepository.find(
    {},
    {
      select: 'tender tenderName loaNumber loaDate bgNumber',
      sort: { tenderName: 1, createdAt: -1 },
      populate: [{ path: 'tender', select: 'tenderName nitNumber loaNumber loaDate' }],
    }
  );

  const seen = new Set();
  return items.filter((row) => {
    const key = String(row.tender?._id || row.tender);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getById(id) {
  const doc = await financialDocumentRepository.findById(id, { populate: POPULATE });
  if (!doc) throw new ApiError(404, 'Financial document not found');
  return doc;
}

async function create(data, actorId) {
  const tender = await resolveTender(data.tender);
  const deadlines = computeDeadlines(tender.loaDate);
  const partyOptions = Object.values(LOA_TYPES);
  const partyName = partyOptions.includes(data.partyName) ? data.partyName : LOA_TYPES.NOTOFIRE;

  const created = await financialDocumentRepository.create({
    tender: data.tender,
    tenderName: tender.tenderName || '',
    loaNumber: tender.loaNumber || '',
    loaDate: tender.loaDate || null,
    bgNumber: String(data.bgNumber || '').trim(),
    partyName,
    bgAmount: Math.max(0, Number(data.bgAmount) || 0),
    bgDeadline21: deadlines.bgDeadline21,
    bgDeadline60: deadlines.bgDeadline60,
    bgDispatch: data.bgDispatch || null,
    bgSubmission: data.bgSubmission || null,
    bgVerify: data.bgVerify || null,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(created._id);
}

async function update(id, data, actorId) {
  const existing = await financialDocumentRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Financial document not found');

  const updates = { updatedBy: actorId };

  if (data.tender !== undefined) {
    const tender = await resolveTender(data.tender);
    const deadlines = computeDeadlines(tender.loaDate);
    updates.tender = data.tender;
    updates.tenderName = tender.tenderName || '';
    updates.loaNumber = tender.loaNumber || '';
    updates.loaDate = tender.loaDate || null;
    updates.bgDeadline21 = deadlines.bgDeadline21;
    updates.bgDeadline60 = deadlines.bgDeadline60;
  }

  if (data.bgNumber !== undefined) updates.bgNumber = String(data.bgNumber || '').trim();
  if (data.partyName !== undefined) {
    const partyOptions = Object.values(LOA_TYPES);
    updates.partyName = partyOptions.includes(data.partyName) ? data.partyName : existing.partyName;
  }
  if (data.bgAmount !== undefined) updates.bgAmount = Math.max(0, Number(data.bgAmount) || 0);
  if (data.bgDispatch !== undefined) updates.bgDispatch = data.bgDispatch || null;
  if (data.bgSubmission !== undefined) updates.bgSubmission = data.bgSubmission || null;
  if (data.bgVerify !== undefined) updates.bgVerify = data.bgVerify || null;

  await financialDocumentRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const doc = await financialDocumentRepository.deleteById(id);
  if (!doc) throw new ApiError(404, 'Financial document not found');
}

module.exports = { list, options, getById, create, update, remove };
