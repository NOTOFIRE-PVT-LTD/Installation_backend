const bgApplicationRepository = require('../repositories/bgApplication.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['applicantNameAddress', 'beneficiaryNameAddress', 'expiryDate', 'createdAt'];

const TEXT_FIELDS = [
  'accountNumber',
  'branchCode',
  'branchName',
  'typeOfApplication',
  'amendmentExistingGuaranteeNumber',
  'applicantNameAddress',
  'applicantContactPersonMobile',
  'applicantPan',
  'applicantLeiCode',
  'applicantEmail',
  'applicantRegisteredAddress',
  'natureOfBankGuarantee',
  'typeOfBG',
  'purpose',
  'bgAmountFigures',
  'bgAmountWords',
  'beneficiaryNameAddress',
  'beneficiaryContactPersonMobile',
  'beneficiaryEmail',
  'beneficiaryGstNumber',
  'beneficiaryPan',
  'beneficiaryLeiCode',
  'beneficiaryBankNameAddress',
  'beneficiaryBankIfscSwift',
  'advisingBankNameAddress',
  'advisingBankIfscSwift',
  'marginFdNo',
  'marginOther',
  'marginNewFdDebitAccount',
  'claimDebitAccountNumber',
  'otherDocumentsSpecify',
];
const NUMBER_FIELDS = [
  'bgTenorYears',
  'bgTenorMonths',
  'bgTenorDays',
  'claimExpiryYear',
  'marginFdAmount',
  'marginNewFdAmount',
  'delayedPaymentInterestPercent',
];
const DATE_FIELDS = [
  'applicantDateOfIncorporation',
  'beneficiaryDateOfIncorporation',
  'expiryDate',
  'claimExpiryDate',
  'declarationDate',
];
const BOOLEAN_FIELDS = ['documentsContractAgreementCopy', 'documentsBankGuaranteeText', 'documentsCounterGuarantee', 'documentsOther'];

function pickFields(data) {
  const updates = {};
  TEXT_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });
  NUMBER_FIELDS.forEach((field) => {
    if (data[field] !== undefined) {
      if (field === 'claimExpiryYear' && (data[field] === '' || data[field] == null)) {
        updates[field] = null;
      } else {
        updates[field] = Number(data[field]) || 0;
      }
    }
  });
  DATE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field] || null;
  });
  BOOLEAN_FIELDS.forEach((field) => {
    if (data[field] !== undefined) updates[field] = Boolean(data[field]);
  });
  return updates;
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$or = [{ applicantNameAddress: regex }, { beneficiaryNameAddress: regex }, { natureOfBankGuarantee: regex }];
  }
  if (query.typeOfBG) filter.typeOfBG = query.typeOfBG;

  const { items, total } = await bgApplicationRepository.paginate({ filter, sort, skip, limit: pageSize });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const entry = await bgApplicationRepository.findById(id);
  if (!entry) throw new ApiError(404, 'BG application not found');
  return entry;
}

async function create(data, actorId) {
  const payload = { ...pickFields(data), createdBy: actorId, updatedBy: actorId };
  return bgApplicationRepository.create(payload);
}

async function update(id, data, actorId) {
  const updates = { ...pickFields(data), updatedBy: actorId };
  const entry = await bgApplicationRepository.updateById(id, updates);
  if (!entry) throw new ApiError(404, 'BG application not found');
  return entry;
}

async function remove(id) {
  const entry = await bgApplicationRepository.deleteById(id);
  if (!entry) throw new ApiError(404, 'BG application not found');
}

module.exports = { list, getById, create, update, remove };
