const quotationRepository = require('../repositories/quotation.repository');
const quotationMasterRepository = require('../repositories/quotationMaster.repository');
const QuotationProduct = require('../models/QuotationProduct.model');
const uploadService = require('./upload.service');
const { QUOTATION_STATUSES } = require('../models/Quotation.model');
const { QUOTATION_MASTER_KINDS } = require('../models/QuotationMaster.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const QUOTATION_SORT = ['quotationNo', 'quotationDate', 'totalAmount', 'status', 'createdAt'];
const QUOTATION_MAX_PAGE_SIZE = 1000;

function text(value) {
  return String(value ?? '').trim();
}

function num(value, { min = 0, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ----------------------------- Masters ----------------------------- */

function assertKind(kind) {
  if (!QUOTATION_MASTER_KINDS.includes(kind)) throw new ApiError(400, 'Invalid master type');
}

async function listMasters(kind) {
  assertKind(kind);
  return quotationMasterRepository.find({ kind, isActive: true }, { sort: { name: 1 } });
}

function masterPayload(data) {
  return {
    name: text(data.name),
    gstin: text(data.gstin).toUpperCase(),
    contactPerson: text(data.contactPerson),
    phone: text(data.phone),
    email: text(data.email),
    address: text(data.address),
    content: text(data.content),
  };
}

async function createMaster(kind, data, actorId) {
  assertKind(kind);
  const payload = masterPayload(data);
  if (!payload.name) throw new ApiError(400, kind === 'terms' ? 'Title is required' : 'Name is required');
  return quotationMasterRepository.create({ ...payload, kind, createdBy: actorId, updatedBy: actorId });
}

async function updateMaster(id, data, actorId) {
  const existing = await quotationMasterRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Record not found');
  const payload = masterPayload({ ...existing.toObject(), ...data });
  if (!payload.name) throw new ApiError(400, 'Name is required');
  return quotationMasterRepository.updateById(id, { ...payload, updatedBy: actorId });
}

async function removeMaster(id) {
  const existing = await quotationMasterRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Record not found');
  // Soft delete: saved quotations keep their own snapshot of company / party / terms.
  await quotationMasterRepository.updateById(id, { isActive: false });
}

/* ----------------------------- Products ----------------------------- */

async function listProducts(query = {}) {
  const filter = { isActive: true };
  const terms = text(query.search).split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return { $or: [{ modelNo: regex }, { description: regex }, { category: regex }, { approvals: regex }] };
    });
  }
  return QuotationProduct.find(filter).sort({ modelNo: 1, description: 1 });
}

async function productCategories() {
  const fromProducts = await QuotationProduct.distinct('category', { isActive: true, category: { $ne: '' } });
  return fromProducts.sort((a, b) => a.localeCompare(b));
}

async function uploadProductFile(file) {
  if (!file) return undefined;
  const uploaded = await uploadService.uploadCadFile(file);
  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
    originalName: uploaded.originalName,
  };
}

function productPayload(data) {
  return {
    modelNo: text(data.modelNo),
    description: text(data.description),
    price: num(data.price),
    category: text(data.category),
    unit: text(data.unit) || 'Nos',
    approvals: text(data.approvals),
  };
}

async function createProduct(data, files, actorId) {
  const payload = productPayload(data);
  if (!payload.modelNo && !payload.description) {
    throw new ApiError(400, 'Enter a model number or description');
  }
  const [datasheet, picture] = await Promise.all([
    uploadProductFile(files?.productDatasheet?.[0]),
    uploadProductFile(files?.productPicture?.[0]),
  ]);
  return QuotationProduct.create({
    ...payload,
    datasheet: datasheet || null,
    picture: picture || null,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

async function updateProduct(id, data, files, actorId) {
  const existing = await QuotationProduct.findById(id);
  if (!existing) throw new ApiError(404, 'Product not found');
  const payload = productPayload({ ...existing.toObject(), ...data });
  if (!payload.modelNo && !payload.description) {
    throw new ApiError(400, 'Enter a model number or description');
  }

  const [datasheet, picture] = await Promise.all([
    uploadProductFile(files?.productDatasheet?.[0]),
    uploadProductFile(files?.productPicture?.[0]),
  ]);
  const update = { ...payload, updatedBy: actorId };
  const removeDatasheet = data.removeDatasheet === 'true' || data.removeDatasheet === true;
  const removePicture = data.removePicture === 'true' || data.removePicture === true;
  if (datasheet || removeDatasheet) {
    if (existing.datasheet?.publicId) {
      await uploadService.deleteAsset(existing.datasheet.publicId, existing.datasheet.resourceType || 'raw');
    }
    update.datasheet = datasheet || null;
  }
  if (picture || removePicture) {
    if (existing.picture?.publicId) {
      await uploadService.deleteAsset(existing.picture.publicId, existing.picture.resourceType || 'image');
    }
    update.picture = picture || null;
  }
  return QuotationProduct.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

async function removeProduct(id) {
  const existing = await QuotationProduct.findById(id);
  if (!existing) throw new ApiError(404, 'Product not found');
  // Soft delete: saved quotations keep their own copy of the product line.
  await QuotationProduct.findByIdAndUpdate(id, { isActive: false });
}

/* -------------------------- Product options -------------------------- */

async function productOptions() {
  const quotationProducts = await QuotationProduct.find({ isActive: true }).sort({ modelNo: 1 }).lean();
  return quotationProducts.map((product) => ({
    _id: product._id,
    source: 'product',
    modelNo: product.modelNo || product.description,
    description: product.description || '',
    price: Number(product.price) || 0,
    category: product.category || '',
    unit: product.unit || 'Nos',
    approvals: product.approvals || '',
  }));
}

/* ---------------------------- Quotations ---------------------------- */

function computeTotals(data) {
  const items = (Array.isArray(data.items) ? data.items : [])
    .map((row) => {
      const qty = num(row.qty);
      const price = num(row.price);
      return {
        lineType: row.lineType === 'sub' ? 'sub' : 'main',
        masterItem: row.masterItem || null,
        modelNo: text(row.modelNo),
        description: text(row.description),
        category: text(row.category),
        qty,
        unit: text(row.unit) || 'Nos',
        price,
        total: round2(qty * price),
      };
    })
    .filter((row) => row.modelNo || row.description);

  const discountPercent = num(data.discountPercent, { max: 100 });
  const gstRate = num(data.gstRate);
  const packingFreight = num(data.packingFreight);
  const subtotal = round2(items.reduce((sum, row) => sum + row.total, 0));
  const discountAmount = round2((subtotal * discountPercent) / 100);
  const afterDiscount = round2(subtotal - discountAmount);
  const gstAmount = round2((afterDiscount * gstRate) / 100);
  const totalAmount = round2(afterDiscount + gstAmount + packingFreight);

  return {
    items,
    discountPercent,
    gstRate,
    packingFreight,
    subtotal,
    discountAmount,
    afterDiscount,
    gstAmount,
    totalAmount,
  };
}

async function resolveContact(kind, data) {
  const snapshot = data || {};
  if (snapshot.ref) {
    const master = await quotationMasterRepository.findById(snapshot.ref);
    if (!master || master.kind !== kind) throw new ApiError(400, `Selected ${kind} not found`);
    return {
      ref: master._id,
      name: master.name,
      gstin: master.gstin,
      contactPerson: master.contactPerson,
      phone: master.phone,
      email: master.email,
      address: master.address,
    };
  }
  return {
    ref: null,
    name: text(snapshot.name),
    gstin: text(snapshot.gstin),
    contactPerson: text(snapshot.contactPerson),
    phone: text(snapshot.phone),
    email: text(snapshot.email),
    address: text(snapshot.address),
  };
}

async function resolveTerms(data) {
  const terms = data || {};
  if (terms.ref) {
    const master = await quotationMasterRepository.findById(terms.ref);
    if (!master || master.kind !== 'terms') throw new ApiError(400, 'Selected terms not found');
    return { ref: master._id, title: master.name, content: text(terms.content) || master.content };
  }
  return { ref: null, title: text(terms.title), content: text(terms.content) };
}

async function buildQuotationFields(data) {
  const company = await resolveContact('company', data.company);
  const party = await resolveContact('party', data.party);
  if (!company.name) throw new ApiError(400, 'Company is required');
  if (!party.name) throw new ApiError(400, 'Party is required');
  if (!text(data.salesperson)) throw new ApiError(400, 'Salesperson is required');
  if (!text(data.projectName)) throw new ApiError(400, 'Project name is required');

  const totals = computeTotals(data);
  if (totals.items.length === 0) throw new ApiError(400, 'Add at least one product');

  return {
    company,
    party,
    salesperson: text(data.salesperson),
    projectName: text(data.projectName),
    preparedBy: text(data.preparedBy),
    techSpecCheckedBy: text(data.techSpecCheckedBy),
    checkedBy: text(data.checkedBy),
    quotationDate: data.quotationDate || new Date(),
    terms: await resolveTerms(data.terms),
    notes: text(data.notes),
    ...totals,
  };
}

async function nextQuotationNumber() {
  const year = new Date().getFullYear();
  const last = await quotationRepository.model.findOne({ seqYear: year }).sort({ seq: -1 }).select('seq').lean();
  const seq = (last?.seq || 0) + 1;
  return { seq, seqYear: year, quotationNo: `QT-${String(seq).padStart(4, '0')}-${String(year).slice(-2)}` };
}

async function createWithNumber(fields, actorId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const numbering = await nextQuotationNumber();
    try {
      return await quotationRepository.create({ ...fields, ...numbering, createdBy: actorId, updatedBy: actorId });
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err;
    }
  }
  throw new ApiError(500, 'Could not allocate quotation number');
}

function listFilter(query) {
  const filter = { isDeleted: query.trash === 'true' };
  if (query.status && QUOTATION_STATUSES.includes(query.status)) filter.status = query.status;
  const terms = text(query.search)
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return {
        $or: [
          { quotationNo: regex },
          { 'party.name': regex },
          { 'company.name': regex },
          { salesperson: regex },
          { projectName: regex },
          { status: regex },
        ],
      };
    });
  }
  return filter;
}

async function listQuotations(query) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: QUOTATION_MAX_PAGE_SIZE });
  const sort = buildSort(query, QUOTATION_SORT);
  const { items, total } = await quotationRepository.paginate({ filter: listFilter(query), sort, skip, limit: pageSize });
  const [activeCount, trashCount] = await Promise.all([
    quotationRepository.countDocuments({ isDeleted: false }),
    quotationRepository.countDocuments({ isDeleted: true }),
  ]);
  return { ...buildPaginatedResult({ items, total, page, pageSize }), counts: { active: activeCount, trash: trashCount } };
}

async function getQuotationById(id) {
  const quotation = await quotationRepository.findById(id);
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  return quotation;
}

async function createQuotation(data, actorId) {
  const fields = await buildQuotationFields(data);
  return createWithNumber({ ...fields, status: 'draft' }, actorId);
}

async function updateQuotation(id, data, actorId) {
  const existing = await getQuotationById(id);
  if (existing.isDeleted) throw new ApiError(400, 'Restore the quotation from trash before editing');
  const fields = await buildQuotationFields(data);
  return quotationRepository.updateById(id, { ...fields, updatedBy: actorId });
}

async function duplicateQuotation(id, actorId) {
  const source = (await getQuotationById(id)).toObject();
  const fields = {
    company: source.company,
    party: source.party,
    salesperson: source.salesperson,
    projectName: source.projectName,
    preparedBy: source.preparedBy,
    techSpecCheckedBy: source.techSpecCheckedBy,
    checkedBy: source.checkedBy,
    quotationDate: new Date(),
    terms: source.terms,
    notes: source.notes,
    ...computeTotals(source),
    status: 'draft',
  };
  return createWithNumber(fields, actorId);
}

async function setStatus(id, status, actorId) {
  if (!QUOTATION_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  await getQuotationById(id);
  return quotationRepository.updateById(id, { status, updatedBy: actorId });
}

async function moveToTrash(id, actorId) {
  await getQuotationById(id);
  return quotationRepository.updateById(id, { isDeleted: true, deletedAt: new Date(), updatedBy: actorId });
}

async function restoreFromTrash(id, actorId) {
  await getQuotationById(id);
  return quotationRepository.updateById(id, { isDeleted: false, deletedAt: null, updatedBy: actorId });
}

async function deletePermanently(id) {
  const existing = await getQuotationById(id);
  if (!existing.isDeleted) throw new ApiError(400, 'Move the quotation to trash before deleting permanently');
  await quotationRepository.deleteById(id);
}

module.exports = {
  listMasters,
  createMaster,
  updateMaster,
  removeMaster,
  listProducts,
  productCategories,
  createProduct,
  updateProduct,
  removeProduct,
  productOptions,
  listQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  duplicateQuotation,
  setStatus,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
};
