const callLetterRepository = require('../repositories/callLetter.repository');
const contractAgreementRepository = require('../repositories/contractAgreement.repository');
const nitTenderRepository = require('../repositories/nitTender.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['tenderName', 'zone', 'callLetter', 'createdAt'];
const POPULATE = [
  { path: 'tender', select: 'tenderName nitNumber loaNumber loaDate' },
  { path: 'contractAgreement', select: 'caNumber caDate tenderName' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

async function resolveTenderWithContractAgreement(tenderId) {
  if (!tenderId) throw new ApiError(400, 'Tender is required');
  const tender = await nitTenderRepository.findById(tenderId);
  if (!tender) throw new ApiError(404, 'Tender not found');

  const caDocs = await contractAgreementRepository.find({ tender: tenderId }, { sort: { createdAt: -1 } });
  const caDoc = caDocs[0];
  if (!caDoc) {
    throw new ApiError(
      400,
      'Contract Agreement is required first. Create a Contract Agreement for this tender after BG Document.'
    );
  }

  return { tender, caDoc };
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);
  const filter = {};
  if (query.tender) filter.tender = query.tender;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ callLetter: regex }, { tenderName: regex }, { zone: regex }];
  }

  const { items, total } = await callLetterRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const doc = await callLetterRepository.findById(id, { populate: POPULATE });
  if (!doc) throw new ApiError(404, 'Call letter not found');
  return doc;
}

async function create(data, actorId) {
  const { tender, caDoc } = await resolveTenderWithContractAgreement(data.tender);

  const created = await callLetterRepository.create({
    tender: data.tender,
    contractAgreement: caDoc._id,
    tenderName: tender.tenderName || caDoc.tenderName || '',
    zone: String(data.zone || '').trim(),
    callLetter: String(data.callLetter || '').trim(),
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(created._id);
}

async function update(id, data, actorId) {
  const existing = await callLetterRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Call letter not found');

  const updates = { updatedBy: actorId };

  if (data.tender !== undefined) {
    const { tender, caDoc } = await resolveTenderWithContractAgreement(data.tender);
    updates.tender = data.tender;
    updates.contractAgreement = caDoc._id;
    updates.tenderName = tender.tenderName || caDoc.tenderName || '';
  }
  if (data.zone !== undefined) updates.zone = String(data.zone || '').trim();
  if (data.callLetter !== undefined) updates.callLetter = String(data.callLetter || '').trim();

  await callLetterRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const doc = await callLetterRepository.deleteById(id);
  if (!doc) throw new ApiError(404, 'Call letter not found');
}

module.exports = { list, getById, create, update, remove };
