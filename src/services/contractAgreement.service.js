const contractAgreementRepository = require('../repositories/contractAgreement.repository');
const financialDocumentRepository = require('../repositories/financialDocument.repository');
const nitTenderRepository = require('../repositories/nitTender.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['caDate', 'caNumber', 'tenderName', 'createdAt'];
const POPULATE = [
  { path: 'tender', select: 'tenderName nitNumber loaNumber loaDate' },
  { path: 'financialDocument', select: 'bgNumber loaNumber loaDate tenderName' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

async function resolveTenderWithBg(tenderId) {
  if (!tenderId) throw new ApiError(400, 'Tender is required');
  const tender = await nitTenderRepository.findById(tenderId);
  if (!tender) throw new ApiError(404, 'Tender not found');

  const bgDocs = await financialDocumentRepository.find({ tender: tenderId }, { sort: { createdAt: -1 } });
  const bgDoc = bgDocs[0];
  if (!bgDoc) {
    throw new ApiError(400, 'BG Document is required first. Create a Financial Document (BG) for this tender.');
  }

  return { tender, bgDoc };
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);
  const filter = {};
  if (query.tender) filter.tender = query.tender;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ caNumber: regex }, { tenderName: regex }];
  }

  const { items, total } = await contractAgreementRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function options() {
  const items = await contractAgreementRepository.find(
    {},
    {
      select: 'tender tenderName caNumber caDate',
      sort: { tenderName: 1, createdAt: -1 },
      populate: [{ path: 'tender', select: 'tenderName nitNumber loaNumber' }],
    }
  );

  // Unique by tender (latest CA wins due to sort).
  const seen = new Set();
  return items.filter((row) => {
    const key = String(row.tender?._id || row.tender);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getById(id) {
  const doc = await contractAgreementRepository.findById(id, { populate: POPULATE });
  if (!doc) throw new ApiError(404, 'Contract agreement not found');
  return doc;
}

async function create(data, actorId) {
  const { tender, bgDoc } = await resolveTenderWithBg(data.tender);

  const created = await contractAgreementRepository.create({
    tender: data.tender,
    financialDocument: bgDoc._id,
    tenderName: tender.tenderName || bgDoc.tenderName || '',
    caDate: data.caDate,
    caNumber: String(data.caNumber || '').trim(),
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(created._id);
}

async function update(id, data, actorId) {
  const existing = await contractAgreementRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Contract agreement not found');

  const updates = { updatedBy: actorId };

  if (data.tender !== undefined) {
    const { tender, bgDoc } = await resolveTenderWithBg(data.tender);
    updates.tender = data.tender;
    updates.financialDocument = bgDoc._id;
    updates.tenderName = tender.tenderName || bgDoc.tenderName || '';
  }
  if (data.caDate !== undefined) updates.caDate = data.caDate;
  if (data.caNumber !== undefined) updates.caNumber = String(data.caNumber || '').trim();

  await contractAgreementRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const doc = await contractAgreementRepository.deleteById(id);
  if (!doc) throw new ApiError(404, 'Contract agreement not found');
}

module.exports = { list, options, getById, create, update, remove };
