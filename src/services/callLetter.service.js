const callLetterRepository = require('../repositories/callLetter.repository');
const contractAgreementRepository = require('../repositories/contractAgreement.repository');
const nitTenderRepository = require('../repositories/nitTender.repository');
const {
  parseCallLetterPdfWithGemini,
  generateCallLetterExcelBuffer,
  DEFAULT_SPARES,
} = require('./callLetterAiExcel.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['tenderName', 'zone', 'callLetter', 'loaNoAndDate', 'contractorName', 'createdAt'];
const POPULATE = [
  { path: 'tender', select: 'tenderName nitNumber loaNumber loaDate' },
  { path: 'contractAgreement', select: 'caNumber caDate tenderName' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

async function resolveOptionalTenderAndCa(tenderId) {
  if (!tenderId) return { tender: null, caDoc: null };
  const tender = await nitTenderRepository.findById(tenderId);
  if (!tender) throw new ApiError(404, 'Tender not found');

  const caDocs = await contractAgreementRepository.find({ tender: tenderId }, { sort: { createdAt: -1 } });
  const caDoc = caDocs[0] || null;
  return { tender, caDoc };
}

function buildCallLetterFields(data = {}, tender = null, caDoc = null) {
  const items = Array.isArray(data.items) ? data.items : [];
  const proformaRows = Array.isArray(data.proformaRows) ? data.proformaRows : [];
  const spares = Array.isArray(data.spares) && data.spares.length ? data.spares : DEFAULT_SPARES;
  const costSource = proformaRows.length ? proformaRows : items;
  const computedCost = costSource.reduce(
    (sum, item) => sum + (Number(item?.qtyValue) || 0) * (Number(item?.depttSchRate) || 0),
    0
  );

  const nameOfWork = String(data.nameOfWork || '').trim();
  const loaNoAndDate = String(data.loaNoAndDate || '').trim();
  const tenderName =
    tender?.tenderName ||
    caDoc?.tenderName ||
    String(data.tenderName || '').trim() ||
    nameOfWork ||
    loaNoAndDate ||
    'RDSO Call Letter';

  return {
    tenderName,
    zone: String(data.zone || data.orderingAuthority || '').trim(),
    callLetter: String(data.callLetter || data.callLetterNoAndDate || data.forwardedLetterNo || loaNoAndDate || '').trim(),
    nameOfWork,
    loaNoAndDate,
    orderingAuthority: String(data.orderingAuthority || '').trim(),
    contractorName: String(data.contractorName || '').trim(),
    contractorShortName: String(data.contractorShortName || '').trim(),
    consignee: String(data.consignee || '').trim(),
    inspectionChargesBy: String(data.inspectionChargesBy || 'Contractor').trim(),
    inspectionAuthority: String(data.inspectionAuthority || 'RDSO, Lucknow').trim(),
    contractValidity: String(data.contractValidity || '').trim(),
    forwardedLetterNo: String(data.forwardedLetterNo || '').trim(),
    letterDate: String(data.letterDate || '').trim(),
    firmNameAndPlace: String(data.firmNameAndPlace || '').trim(),
    specificationNo: String(data.specificationNo || 'RDSO/SPN/217/2025 Version - 3.1 Or Latest').trim(),
    callLetterNoAndDate: String(data.callLetterNoAndDate || '').trim(),
    dateOfInspection: String(data.dateOfInspection || '').trim(),
    inspectingOfficial: String(data.inspectingOfficial || '').trim(),
    guaranteeCertificateNo: String(data.guaranteeCertificateNo || '').trim(),
    guaranteeIssueDate: String(data.guaranteeIssueDate || '').trim(),
    sbCollectRefNo: String(data.sbCollectRefNo || '').trim(),
    sbCollectDate: String(data.sbCollectDate || '').trim(),
    payerGstin: String(data.payerGstin || '09AAGCN7119L1Z0').trim(),
    totalMaterialCost: Number(data.totalMaterialCost) || Math.round(computedCost * 100) / 100,
    proformaRows,
    items,
    spares,
  };
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);
  const filter = {};
  if (query.tender) filter.tender = query.tender;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { callLetter: regex },
      { tenderName: regex },
      { zone: regex },
      { loaNoAndDate: regex },
      { contractorName: regex },
      { nameOfWork: regex },
    ];
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
  const { tender, caDoc } = await resolveOptionalTenderAndCa(data.tender);
  const fields = buildCallLetterFields(data, tender, caDoc);

  const created = await callLetterRepository.create({
    tender: tender?._id || null,
    contractAgreement: caDoc?._id || null,
    ...fields,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(created._id);
}

async function update(id, data, actorId) {
  const existing = await callLetterRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Call letter not found');

  const merged = { ...existing.toObject(), ...data };
  const { tender, caDoc } = await resolveOptionalTenderAndCa(merged.tender);
  const fields = buildCallLetterFields(merged, tender, caDoc);

  await callLetterRepository.updateById(id, {
    tender: tender?._id || null,
    contractAgreement: caDoc?._id || null,
    ...fields,
    updatedBy: actorId,
  });
  return getById(id);
}

async function remove(id) {
  const doc = await callLetterRepository.deleteById(id);
  if (!doc) throw new ApiError(404, 'Call letter not found');
}

async function parsePdf(file) {
  if (!file) throw new ApiError(400, 'Please upload a PDF or image file');
  return parseCallLetterPdfWithGemini(file.buffer, file.mimetype);
}

async function exportExcelById(id) {
  const doc = await getById(id);
  return generateCallLetterExcelBuffer(doc.toObject ? doc.toObject() : doc);
}

async function exportExcelDirect(data) {
  return generateCallLetterExcelBuffer(data);
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  parsePdf,
  exportExcelById,
  exportExcelDirect,
};
