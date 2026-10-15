const mongoose = require('mongoose');
const deliveryChallanRepository = require('../repositories/deliveryChallan.repository');
const quotationMasterRepository = require('../repositories/quotationMaster.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');
const { fiscalYearOf, companyCodeOf } = require('../utils/docNumbering');

const DC_MAX_PAGE_SIZE = 500;

const TEXT_FIELDS = [
  'receiverName',
  'receiverNumber',
  'placeOfSupply',
  'deliveryAddress',
  'amountInWords',
  'modeOfDispatch',
  'vehicleTransporter',
  'expectedDuration',
  'originalInvoiceRef',
  'panelNo',
  'complaintNo',
  'fault',
  'approvedBy',
  'requestedBy',
  'notes',
];

function text(value) {
  return String(value ?? '').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(n, 0) : 0;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "NF/UP/26-27/261" -> { series: "NF/UP/26-27", seq: 261 } */
function splitNumber(dcNumber) {
  const match = text(dcNumber).match(/^(.+)\/(\d+)$/);
  if (!match) return { series: '', seq: null };
  return { series: match[1], seq: Number(match[2]) };
}

function formatNumber(series, seq) {
  return `${series}/${String(seq).padStart(3, '0')}`;
}

async function loadCompany(id) {
  if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(400, 'Seller company is required');
  const master = await quotationMasterRepository.findById(id);
  if (!master || master.kind !== 'company') throw new ApiError(400, 'Selected seller company not found');
  return master;
}

async function nextSeq(series) {
  const last = await deliveryChallanRepository.model
    .findOne({ series, seq: { $ne: null } })
    .sort({ seq: -1 })
    .select('seq')
    .lean();
  return (last?.seq || 0) + 1;
}

/**
 * Next number in every series the company used this financial year (most recently used first),
 * plus the default CODE/DC/YY-YY series.
 */
async function suggestNumbers({ company, date } = {}) {
  const master = await loadCompany(company);
  const code = companyCodeOf(master, 'DC');
  const fy = fiscalYearOf(date, { short: true });
  const defaultSeries = `${code}/DC/${fy}`;

  const used = await deliveryChallanRepository.model.aggregate([
    { $match: { series: new RegExp(`^${escapeRegex(code)}/.*/${escapeRegex(fy)}$`), seq: { $ne: null } } },
    { $group: { _id: '$series', maxSeq: { $max: '$seq' }, lastUsed: { $max: '$createdAt' } } },
    { $sort: { lastUsed: -1 } },
  ]);

  const suggestions = used.map((row) => ({ series: row._id, dcNumber: formatNumber(row._id, row.maxSeq + 1) }));
  if (!suggestions.some((s) => s.series === defaultSeries)) {
    suggestions.push({ series: defaultSeries, dcNumber: formatNumber(defaultSeries, 1) });
  }
  return { suggestions, dcNumber: suggestions[0].dcNumber };
}

function buildItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((row) => {
      const qty = num(row.qty);
      const rate = num(row.rate);
      return {
        name: text(row.name),
        hsnCode: text(row.hsnCode),
        qty,
        uom: text(row.uom) || 'Nos',
        rate,
        value: round2(qty * rate),
      };
    })
    .filter((row) => row.name);
}

async function buildFields(data) {
  const company = await loadCompany(data.company?.ref);
  const recipientName = text(data.recipient?.name);
  if (!recipientName) throw new ApiError(400, 'Recipient name is required');
  const items = buildItems(data.items);
  if (items.length === 0) throw new ApiError(400, 'Add at least one item');

  const recipientRef = data.recipient?.ref;
  const fields = {
    dcDate: data.dcDate || new Date(),
    company: {
      ref: company._id,
      name: company.name,
      code: companyCodeOf(company, 'DC'),
      gstin: company.gstin,
      cin: company.cin,
      phone: company.phone,
      email: company.email,
      address: company.address,
    },
    recipient: {
      ref: recipientRef && mongoose.isValidObjectId(recipientRef) ? recipientRef : null,
      name: recipientName,
      address: text(data.recipient?.address),
    },
    items,
    totalValue: round2(items.reduce((sum, row) => sum + row.value, 0)),
    rateOfTax: text(data.rateOfTax) || 'GST not applicable',
    taxAmount: text(data.taxAmount) || 'NA',
  };
  TEXT_FIELDS.forEach((key) => {
    fields[key] = text(data[key]);
  });
  return fields;
}

async function uploadAttachments(files = []) {
  return Promise.all(
    files.map(async (file) => {
      const uploaded = await uploadService.uploadCadFile(file);
      return {
        url: uploaded.url,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
      };
    })
  );
}

async function deleteAttachments(attachments = []) {
  await Promise.all(
    attachments
      .filter((file) => file.publicId)
      .map((file) => uploadService.deleteAsset(file.publicId, file.resourceType || 'image'))
  );
}

function duplicateNumberError(err) {
  if (err?.code === 11000) return new ApiError(409, 'This DC number is already used. Enter a different DC number.');
  return err;
}

async function listDeliveryChallans(query = {}) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: DC_MAX_PAGE_SIZE });
  const filter = {};
  const terms = text(query.search).split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return {
        $or: [
          { dcNumber: regex },
          { 'recipient.name': regex },
          { receiverName: regex },
          { receiverNumber: regex },
          { 'company.name': regex },
          { placeOfSupply: regex },
          { complaintNo: regex },
        ],
      };
    });
  }
  const { items, total } = await deliveryChallanRepository.paginate({
    filter,
    sort: { dcDate: -1, createdAt: -1 },
    skip,
    limit: pageSize,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getDeliveryChallanById(id) {
  const dc = await deliveryChallanRepository.findById(id);
  if (!dc) throw new ApiError(404, 'Delivery Challan not found');
  return dc;
}

async function createDeliveryChallan(data, files, actorId) {
  const fields = await buildFields(data);
  const typed = text(data.dcNumber);
  const attachments = await uploadAttachments(files);
  const base = { ...fields, attachments, createdBy: actorId, updatedBy: actorId };

  try {
    // A full number is used as typed; a bare series ("NF/UP/26-27/") or blank gets the next number.
    if (typed && !typed.endsWith('/')) {
      return await deliveryChallanRepository.create({ ...base, dcNumber: typed, ...splitNumber(typed) });
    }
    const series = typed
      ? typed.replace(/\/+$/, '')
      : (await suggestNumbers({ company: fields.company.ref, date: fields.dcDate })).suggestions[0].series;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seq = await nextSeq(series);
      try {
        return await deliveryChallanRepository.create({ ...base, dcNumber: formatNumber(series, seq), series, seq });
      } catch (err) {
        if (err?.code !== 11000 || attempt === 2) throw err;
      }
    }
    throw new ApiError(500, 'Could not allocate DC number');
  } catch (err) {
    await deleteAttachments(attachments);
    throw duplicateNumberError(err);
  }
}

async function updateDeliveryChallan(id, data, files, actorId) {
  const existing = await getDeliveryChallanById(id);
  const fields = await buildFields(data);
  const dcNumber = text(data.dcNumber).replace(/\/+$/, '') || existing.dcNumber;

  const keepIds = new Set((Array.isArray(data.keepAttachmentIds) ? data.keepAttachmentIds : []).map(String));
  const kept = existing.attachments.filter((file) => keepIds.has(String(file._id)));
  const dropped = existing.attachments.filter((file) => !keepIds.has(String(file._id)));
  const added = await uploadAttachments(files);

  const update = { ...fields, dcNumber, attachments: [...kept, ...added], updatedBy: actorId };
  if (dcNumber !== existing.dcNumber) Object.assign(update, splitNumber(dcNumber));

  let saved;
  try {
    saved = await deliveryChallanRepository.updateById(id, update);
  } catch (err) {
    await deleteAttachments(added);
    throw duplicateNumberError(err);
  }
  await deleteAttachments(dropped);
  return saved;
}

async function removeDeliveryChallan(id) {
  const existing = await getDeliveryChallanById(id);
  await deliveryChallanRepository.deleteById(id);
  await deleteAttachments(existing.attachments);
}

module.exports = {
  suggestNumbers,
  listDeliveryChallans,
  getDeliveryChallanById,
  createDeliveryChallan,
  updateDeliveryChallan,
  removeDeliveryChallan,
};
