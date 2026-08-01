const inspectionRepository = require('../repositories/inspection.repository');
const nitTenderRepository = require('../repositories/nitTender.repository');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { INSPECTION_STATUS } = require('../config/constants');

const ALLOWED_SORT_FIELDS = ['inspectionDate', 'inspectorName', 'status', 'loaNumber', 'contractorName', 'createdAt'];
const POPULATE = [
  { path: 'tender', select: 'loaNumber contractorName loaDivisionName loaWorkCompletion loaValue loaItems nitNumber' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRemoveIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

function isTruthyFlag(raw) {
  return String(raw || '').toLowerCase() === 'true' || raw === true;
}

function normalizeChecklistItems(raw) {
  const items = parseJsonArray(raw);
  const allowed = Object.values(INSPECTION_STATUS);
  return items
    .map((item) => ({
      itemName: String(item?.itemName || '').trim(),
      status: allowed.includes(item?.status) ? item.status : INSPECTION_STATUS.PENDING,
      remark: String(item?.remark || '').trim(),
      ...(item?._id ? { _id: item._id } : {}),
    }))
    .filter((item) => item.itemName);
}

async function resolveTender(tenderId) {
  if (!tenderId) throw new ApiError(400, 'Tender is required');
  const tender = await nitTenderRepository.findById(tenderId);
  if (!tender) throw new ApiError(404, 'Tender not found');
  return tender;
}

async function deleteFileAsset(file) {
  if (!file?.publicId) return;
  await uploadService.deleteAsset(file.publicId, file.resourceType || 'raw');
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.tender) filter.tender = query.tender;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { inspectorName: regex },
      { loaNumber: regex },
      { contractorName: regex },
      { firmCallNo: regex },
      { rdsoCallNo: regex },
      { remarks: regex },
    ];
  }

  const { items, total } = await inspectionRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const inspection = await inspectionRepository.findById(id, { populate: POPULATE });
  if (!inspection) throw new ApiError(404, 'Inspection not found');
  return inspection;
}

async function create(data, files, actorId) {
  const tender = await resolveTender(data.tender);

  const dmFile = files?.dmFile?.[0] ? await uploadService.uploadCadFile(files.dmFile[0]) : null;
  const icCopy = files?.icCopy?.[0] ? await uploadService.uploadCadFile(files.icCopy[0]) : null;
  const firmCallLetter = files?.firmCallLetter?.[0]
    ? await uploadService.uploadCadFile(files.firmCallLetter[0])
    : null;
  const otherDetailsFiles = await Promise.all(
    (files?.otherDetailsFiles || []).map((f) => uploadService.uploadCadFile(f))
  );

  const allowed = Object.values(INSPECTION_STATUS);
  const status = allowed.includes(data.status) ? data.status : INSPECTION_STATUS.PENDING;

  const inspection = await inspectionRepository.create({
    tender: data.tender,

    loaNumber: tender.loaNumber || '',
    loaValue: Math.max(0, Number(tender.loaValue) || 0),
    loaWorkCompletion: tender.loaWorkCompletion || null,
    loaDivisionName: tender.loaDivisionName || '',
    contractorName: tender.contractorName || '',
    loaItems: tender.loaItems || [],

    inspectionDate: data.inspectionDate,
    firmCallNo: String(data.firmCallNo || '').trim(),
    rdsoCallNo: String(data.rdsoCallNo || '').trim(),
    inspectorName: String(data.inspectorName || '').trim(),
    fireAlarmQty: Math.max(0, Number(data.fireAlarmQty) || 0),
    controlPanelQty: Math.max(0, Number(data.controlPanelQty) || 0),
    dmNo: String(data.dmNo || '').trim(),
    doc: String(data.doc || '').trim(),
    consignee: String(data.consignee || '').trim(),
    orderingAuthority: String(data.orderingAuthority || '').trim(),
    inspectionChargeBornBy: data.inspectionChargeBornBy,
    mersNo: String(data.mersNo || '').trim(),

    status,
    checklistItems: normalizeChecklistItems(data.checklistItems),
    remarks: String(data.remarks || '').trim(),

    dmFile,
    icCopy,
    firmCallLetter,
    otherDetailsFiles,

    createdBy: actorId,
    updatedBy: actorId,
  });

  return getById(inspection._id);
}

async function update(id, data, files, actorId) {
  const inspection = await inspectionRepository.findById(id);
  if (!inspection) throw new ApiError(404, 'Inspection not found');

  const updates = { updatedBy: actorId };

  if (data.tender !== undefined) {
    const tender = await resolveTender(data.tender);
    updates.tender = data.tender;
    updates.loaNumber = tender.loaNumber || '';
    updates.loaValue = Math.max(0, Number(tender.loaValue) || 0);
    updates.loaWorkCompletion = tender.loaWorkCompletion || null;
    updates.loaDivisionName = tender.loaDivisionName || '';
    updates.contractorName = tender.contractorName || '';
    updates.loaItems = tender.loaItems || [];
  }

  if (data.inspectionDate !== undefined) updates.inspectionDate = data.inspectionDate;
  if (data.firmCallNo !== undefined) updates.firmCallNo = String(data.firmCallNo || '').trim();
  if (data.rdsoCallNo !== undefined) updates.rdsoCallNo = String(data.rdsoCallNo || '').trim();
  if (data.inspectorName !== undefined) updates.inspectorName = String(data.inspectorName || '').trim();
  if (data.fireAlarmQty !== undefined) updates.fireAlarmQty = Math.max(0, Number(data.fireAlarmQty) || 0);
  if (data.controlPanelQty !== undefined) {
    updates.controlPanelQty = Math.max(0, Number(data.controlPanelQty) || 0);
  }
  if (data.dmNo !== undefined) updates.dmNo = String(data.dmNo || '').trim();
  if (data.doc !== undefined) updates.doc = String(data.doc || '').trim();
  if (data.consignee !== undefined) updates.consignee = String(data.consignee || '').trim();
  if (data.orderingAuthority !== undefined) {
    updates.orderingAuthority = String(data.orderingAuthority || '').trim();
  }
  if (data.inspectionChargeBornBy !== undefined) updates.inspectionChargeBornBy = data.inspectionChargeBornBy;
  if (data.mersNo !== undefined) updates.mersNo = String(data.mersNo || '').trim();

  if (data.status !== undefined) {
    const allowed = Object.values(INSPECTION_STATUS);
    if (!allowed.includes(data.status)) throw new ApiError(400, 'Invalid inspection status');
    updates.status = data.status;
  }
  if (data.checklistItems !== undefined) updates.checklistItems = normalizeChecklistItems(data.checklistItems);
  if (data.remarks !== undefined) updates.remarks = String(data.remarks || '').trim();

  // Single-doc replacements / removals
  let nextDmFile = inspection.dmFile || null;
  if (isTruthyFlag(data.removeDmFile)) {
    await deleteFileAsset(nextDmFile);
    nextDmFile = null;
  }
  if (files?.dmFile?.[0]) {
    await deleteFileAsset(nextDmFile);
    nextDmFile = await uploadService.uploadCadFile(files.dmFile[0]);
  }
  updates.dmFile = nextDmFile;

  let nextIcCopy = inspection.icCopy || null;
  if (isTruthyFlag(data.removeIcCopy)) {
    await deleteFileAsset(nextIcCopy);
    nextIcCopy = null;
  }
  if (files?.icCopy?.[0]) {
    await deleteFileAsset(nextIcCopy);
    nextIcCopy = await uploadService.uploadCadFile(files.icCopy[0]);
  }
  updates.icCopy = nextIcCopy;

  let nextFirmCallLetter = inspection.firmCallLetter || null;
  if (isTruthyFlag(data.removeFirmCallLetter)) {
    await deleteFileAsset(nextFirmCallLetter);
    nextFirmCallLetter = null;
  }
  if (files?.firmCallLetter?.[0]) {
    await deleteFileAsset(nextFirmCallLetter);
    nextFirmCallLetter = await uploadService.uploadCadFile(files.firmCallLetter[0]);
  }
  updates.firmCallLetter = nextFirmCallLetter;

  // Multi other-details files
  const removeOtherIds = new Set(parseRemoveIds(data.removeOtherDetailsFileIds));
  let remainingOther = inspection.otherDetailsFiles || [];
  if (removeOtherIds.size > 0) {
    const toRemove = remainingOther.filter((f) => removeOtherIds.has(f.publicId));
    remainingOther = remainingOther.filter((f) => !removeOtherIds.has(f.publicId));
    await Promise.all(toRemove.map((f) => deleteFileAsset(f)));
  }
  const newOther = await Promise.all((files?.otherDetailsFiles || []).map((f) => uploadService.uploadCadFile(f)));
  updates.otherDetailsFiles = [...remainingOther, ...newOther];

  await inspectionRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const inspection = await inspectionRepository.findById(id);
  if (!inspection) throw new ApiError(404, 'Inspection not found');

  await Promise.all([
    deleteFileAsset(inspection.dmFile),
    deleteFileAsset(inspection.icCopy),
    deleteFileAsset(inspection.firmCallLetter),
    ...(inspection.otherDetailsFiles || []).map((f) => deleteFileAsset(f)),
  ]);

  await inspectionRepository.deleteById(id);
}

module.exports = { list, getById, create, update, remove };
