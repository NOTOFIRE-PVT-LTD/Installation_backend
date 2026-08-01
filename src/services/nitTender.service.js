const nitTenderRepository = require('../repositories/nitTender.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { LOA_TYPES } = require('../config/constants');

const ALLOWED_SORT_FIELDS = [
  'tenderName',
  'nitNumber',
  'nitDate',
  'loaNumber',
  'loaDate',
  'loaValue',
  'loaWorkCompletion',
  'loaDivisionName',
  'contractorName',
  'createdAt',
];
const POPULATE = [
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

function normalizeItems(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      itemName: String(item?.itemName || '').trim(),
      amount: Math.max(0, Number(item?.amount) || 0),
      quantity: Math.max(0, Number(item?.quantity) || 0),
      ...(item?._id ? { _id: item._id } : {}),
    }))
    .filter((item) => item.itemName);
}

function normalizeLoaItems(raw = []) {
  if (!Array.isArray(raw)) return [];
  const allowed = Object.values(LOA_TYPES);
  return raw
    .map((item) => ({
      itemName: String(item?.itemName || '').trim(),
      amount: Math.max(0, Number(item?.amount) || 0),
      loaType: allowed.includes(item?.loaType) ? item.loaType : LOA_TYPES.NOTOFIRE,
      ...(item?._id ? { _id: item._id } : {}),
    }))
    .filter((item) => item.itemName);
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { tenderName: regex },
      { nitNumber: regex },
      { loaNumber: regex },
      { loaDivisionName: regex },
      { contractorName: regex },
    ];
  }

  const { items, total } = await nitTenderRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function options() {
  return nitTenderRepository.find(
    { loaNumber: { $nin: [null, ''] } },
    {
      select:
        'tenderName nitNumber nitDate loaNumber loaDate loaValue loaWorkCompletion loaDivisionName contractorName loaItems items',
      sort: { tenderName: 1, createdAt: -1 },
    }
  );
}

async function getById(id) {
  const tender = await nitTenderRepository.findById(id, { populate: POPULATE });
  if (!tender) throw new ApiError(404, 'Tender not found');
  return tender;
}

async function create(data, actorId) {
  const tender = await nitTenderRepository.create({
    tenderName: String(data.tenderName || '').trim(),
    nitNumber: String(data.nitNumber || '').trim(),
    nitDate: data.nitDate || null,
    items: normalizeItems(data.items),
    loaNumber: String(data.loaNumber || '').trim(),
    loaDate: data.loaDate || null,
    loaValue: Math.max(0, Number(data.loaValue) || 0),
    loaWorkCompletion: data.loaWorkCompletion || null,
    loaDivisionName: String(data.loaDivisionName || '').trim(),
    contractorName: String(data.contractorName || '').trim(),
    loaItems: normalizeLoaItems(data.loaItems),
    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(tender._id);
}

async function update(id, data, actorId) {
  const tender = await nitTenderRepository.findById(id);
  if (!tender) throw new ApiError(404, 'Tender not found');

  const updates = { updatedBy: actorId };
  if (data.tenderName !== undefined) updates.tenderName = String(data.tenderName || '').trim();
  if (data.nitNumber !== undefined) updates.nitNumber = String(data.nitNumber || '').trim();
  if (data.nitDate !== undefined) updates.nitDate = data.nitDate || null;
  if (data.items !== undefined) updates.items = normalizeItems(data.items);
  if (data.loaNumber !== undefined) updates.loaNumber = String(data.loaNumber || '').trim();
  if (data.loaDate !== undefined) updates.loaDate = data.loaDate || null;
  if (data.loaValue !== undefined) updates.loaValue = Math.max(0, Number(data.loaValue) || 0);
  if (data.loaWorkCompletion !== undefined) updates.loaWorkCompletion = data.loaWorkCompletion || null;
  if (data.loaDivisionName !== undefined) updates.loaDivisionName = String(data.loaDivisionName || '').trim();
  if (data.contractorName !== undefined) updates.contractorName = String(data.contractorName || '').trim();
  if (data.loaItems !== undefined) updates.loaItems = normalizeLoaItems(data.loaItems);

  await nitTenderRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const tender = await nitTenderRepository.deleteById(id);
  if (!tender) throw new ApiError(404, 'Tender not found');
}

module.exports = { list, options, getById, create, update, remove };
