const proformaInvoiceRepository = require('../repositories/proformaInvoice.repository');
const quotationMasterRepository = require('../repositories/quotationMaster.repository');
const { PI_TEMPLATES } = require('../models/ProformaInvoice.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');

const PI_MAX_PAGE_SIZE = 500;

const NAME_STOP_WORDS = new Set([
  'M/S',
  'MS',
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'CO',
  'COMPANY',
  'AND',
  '&',
  'OF',
  'THE',
]);

function text(value) {
  return String(value ?? '').trim();
}

function num(value, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(n, min);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Indian financial year (April-March), e.g. 2026-27. */
function fiscalYearOf(date) {
  const d = date ? new Date(date) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const start = valid.getMonth() >= 3 ? valid.getFullYear() : valid.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function initials(name, maxLength = 6) {
  const words = text(name)
    .replace(/[^A-Za-z0-9&/\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !NAME_STOP_WORDS.has(word.toUpperCase()));
  return words
    .map((word) => word[0].toUpperCase())
    .join('')
    .slice(0, maxLength);
}

function companyCodeOf(company) {
  return text(company?.code).toUpperCase() || initials(company?.name, 4) || 'PI';
}

async function loadMaster(kind, id) {
  if (!id) return null;
  const master = await quotationMasterRepository.findById(id);
  if (!master || master.kind !== kind) throw new ApiError(400, `Selected ${kind} not found`);
  return master;
}

async function nextSeq(companyCode, fiscalYear) {
  const last = await proformaInvoiceRepository.model
    .findOne({ companyCode, fiscalYear, seq: { $ne: null } })
    .sort({ seq: -1 })
    .select('seq')
    .lean();
  return (last?.seq || 0) + 1;
}

function formatPiNumber(companyCode, partyName, fiscalYear, seq) {
  const partyCode = initials(partyName) || 'XX';
  return `${companyCode}/PI/${partyCode}/${fiscalYear}/${String(seq).padStart(4, '0')}`;
}

/** Suggested PI number for the form (the real number is allocated on save). */
async function suggestNumber({ company, party, date } = {}) {
  const master = await loadMaster('company', company);
  const companyCode = master ? companyCodeOf(master) : 'PI';
  const fiscalYear = fiscalYearOf(date);
  const seq = await nextSeq(companyCode, fiscalYear);
  return { piNumber: formatPiNumber(companyCode, party, fiscalYear, seq), companyCode, fiscalYear, seq };
}

function computeTotals(data) {
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((row) => {
      const qty = num(row.qty);
      const rate = num(row.rate);
      return {
        description: text(row.description),
        modelNo: text(row.modelNo),
        qty,
        unit: text(row.unit) || 'Nos',
        rate,
        amount: round2(qty * rate),
      };
    })
    .filter((row) => row.description || row.modelNo);

  const freight = num(data.freight);
  const gstRate = data.gstRate === undefined || data.gstRate === '' ? 18 : num(data.gstRate);
  const totalExGst = round2(items.reduce((sum, row) => sum + row.amount, 0));
  const totalAmount = round2(totalExGst + freight);
  const gstAmount = round2((totalAmount * gstRate) / 100);
  const netAmount = round2(totalAmount + gstAmount);
  return { items, freight, gstRate, totalExGst, totalAmount, gstAmount, netAmount };
}

async function buildFields(data) {
  const companyMaster = await loadMaster('company', data.company?.ref);
  if (!companyMaster) throw new ApiError(400, 'Seller company is required');
  const partyName = text(data.party?.name);
  if (!partyName) throw new ApiError(400, 'Party name is required');

  const totals = computeTotals(data);
  if (totals.items.length === 0) throw new ApiError(400, 'Add at least one item');

  const bank = data.bank || {};
  const template = PI_TEMPLATES.includes(data.template) ? data.template : 'standard';

  return {
    piDate: data.piDate || new Date(),
    template,
    company: {
      ref: companyMaster._id,
      name: companyMaster.name,
      gstin: text(data.company?.gstin) || companyMaster.gstin,
      phone: companyMaster.phone,
      email: companyMaster.email,
      address: companyMaster.address,
    },
    poNumber: text(data.poNumber),
    party: {
      ref: data.party?.ref || null,
      name: partyName,
      gstin: text(data.party?.gstin).toUpperCase(),
    },
    deliveryAddress: text(data.deliveryAddress),
    quotation: {
      ref: data.quotation?.ref || null,
      quotationNo: text(data.quotation?.quotationNo),
    },
    terms: text(data.terms),
    bank: {
      accountName: text(bank.accountName),
      accountNo: text(bank.accountNo),
      bankName: text(bank.bankName),
      ifsc: text(bank.ifsc).toUpperCase(),
      branch: text(bank.branch),
    },
    preparedBy: text(data.preparedBy),
    checkedBy: text(data.checkedBy),
    kindAttention: text(data.kindAttention),
    remarks: text(data.remarks),
    email: text(data.email),
    ...totals,
    companyCode: companyCodeOf(companyMaster),
    fiscalYear: fiscalYearOf(data.piDate),
  };
}

/** Manually typed numbers in the same series keep the sequence going (e.g. .../0336 -> next is 0337). */
function seqFromNumber(piNumber, fields) {
  const prefix = `${fields.companyCode}/PI/`;
  const match = piNumber.match(/\/(\d+)\s*$/);
  if (!match || !piNumber.toUpperCase().startsWith(prefix) || !piNumber.includes(`/${fields.fiscalYear}/`)) {
    return null;
  }
  return Number(match[1]);
}

function duplicateNumberError(err) {
  if (err?.code === 11000) return new ApiError(409, 'This PI number is already used. Enter a different PI number.');
  return err;
}

async function listProformaInvoices(query = {}) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: PI_MAX_PAGE_SIZE });
  const filter = {};
  const terms = text(query.search).split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return {
        $or: [
          { piNumber: regex },
          { 'party.name': regex },
          { 'quotation.quotationNo': regex },
          { 'company.name': regex },
          { poNumber: regex },
        ],
      };
    });
  }
  const { items, total } = await proformaInvoiceRepository.paginate({
    filter,
    sort: { piDate: -1, createdAt: -1 },
    skip,
    limit: pageSize,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getProformaInvoiceById(id) {
  const pi = await proformaInvoiceRepository.findById(id);
  if (!pi) throw new ApiError(404, 'Proforma Invoice not found');
  return pi;
}

async function createProformaInvoice(data, actorId) {
  const fields = await buildFields(data);
  const typedNumber = text(data.piNumber);

  if (typedNumber) {
    try {
      return await proformaInvoiceRepository.create({
        ...fields,
        piNumber: typedNumber,
        seq: seqFromNumber(typedNumber, fields),
        createdBy: actorId,
        updatedBy: actorId,
      });
    } catch (err) {
      throw duplicateNumberError(err);
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seq = await nextSeq(fields.companyCode, fields.fiscalYear);
    const piNumber = formatPiNumber(fields.companyCode, fields.party.name, fields.fiscalYear, seq);
    try {
      return await proformaInvoiceRepository.create({ ...fields, piNumber, seq, createdBy: actorId, updatedBy: actorId });
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw duplicateNumberError(err);
    }
  }
  throw new ApiError(500, 'Could not allocate PI number');
}

async function updateProformaInvoice(id, data, actorId) {
  const existing = await getProformaInvoiceById(id);
  const fields = await buildFields(data);
  const piNumber = text(data.piNumber) || existing.piNumber;
  const update = { ...fields, piNumber, updatedBy: actorId };
  if (piNumber !== existing.piNumber) {
    update.seq = seqFromNumber(piNumber, fields);
  } else {
    // Keep the original series so later numbers aren't affected by edits to company / date.
    update.companyCode = existing.companyCode;
    update.fiscalYear = existing.fiscalYear;
  }
  try {
    return await proformaInvoiceRepository.updateById(id, update);
  } catch (err) {
    throw duplicateNumberError(err);
  }
}

async function removeProformaInvoice(id) {
  await getProformaInvoiceById(id);
  await proformaInvoiceRepository.deleteById(id);
}

module.exports = {
  suggestNumber,
  listProformaInvoices,
  getProformaInvoiceById,
  createProformaInvoice,
  updateProformaInvoice,
  removeProformaInvoice,
};
