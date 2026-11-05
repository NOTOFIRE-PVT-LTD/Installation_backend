const customerRepository = require('../repositories/customer.repository');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { ROLES, USER_STATUS } = require('../config/constants');
const {
  findDuplicateMatches,
  gstinLooksValid,
  normalizeCompanyName,
  normalizeGstin,
  normalizePhone,
} = require('../utils/customerNormalize');

const ALLOWED_SORT_FIELDS = ['companyName', 'city', 'gstin', 'createdAt'];
const POPULATE = [
  { path: 'assignedSalesperson', select: 'name email mobileNumber' },
  { path: 'createdBy', select: 'name email' },
  { path: 'updatedBy', select: 'name email' },
];

function scopedFilter(actor) {
  if (actor.role === ROLES.ADMIN) return {};
  return {
    $or: [
      { assignedSalesperson: actor._id },
      { assignedSalesperson: null },
      { createdBy: actor._id },
    ],
    active: true,
  };
}

function buildPayload(data) {
  const companyName = String(data.companyName || '').trim();
  if (!companyName) throw new ApiError(400, 'Company name is required');

  const gstin = normalizeGstin(data.gstin);
  if (gstin && !gstinLooksValid(gstin)) {
    throw new ApiError(400, 'GSTIN format looks invalid. Leave it blank if you do not have one.');
  }

  const phone = String(data.phone || '').trim();
  const lat = data.locationLat === '' || data.locationLat == null ? null : Number(data.locationLat);
  const lng = data.locationLng === '' || data.locationLng == null ? null : Number(data.locationLng);

  return {
    companyName,
    normalizedCompanyName: normalizeCompanyName(companyName),
    contactPerson: String(data.contactPerson || '').trim(),
    phone,
    phoneNormalized: phone ? normalizePhone(phone) : '',
    email: String(data.email || '').trim().toLowerCase(),
    address: String(data.address || '').trim(),
    city: String(data.city || '').trim(),
    state: String(data.state || '').trim(),
    pincode: String(data.pincode || '').trim(),
    gstin: gstin || '',
    gstinNormalized: gstin || '',
    assignedSalesperson: data.assignedSalesperson || null,
    locationLat: Number.isFinite(lat) ? lat : null,
    locationLng: Number.isFinite(lng) ? lng : null,
    active: data.active !== false,
    overrideReason: String(data.overrideReason || '').trim(),
  };
}

async function assertSalesperson(userId) {
  if (!userId) return;
  const user = await userRepository.findById(userId);
  if (!user || user.status === USER_STATUS.INACTIVE) throw new ApiError(400, 'Assigned salesperson not found');
}

async function duplicateHits(input, excludeId) {
  const existing = await customerRepository.find(excludeId ? { _id: { $ne: excludeId } } : {});
  return findDuplicateMatches(input, existing);
}

async function list(query, actor) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);
  const filter = scopedFilter(actor);

  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;
  if (query.assignedSalesperson && actor.role === ROLES.ADMIN) {
    filter.assignedSalesperson = query.assignedSalesperson;
  }
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ companyName: regex }, { contactPerson: regex }, { city: regex }, { gstin: regex }, { phone: regex }];
  }

  const { items, total } = await customerRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id, actor) {
  const customer = await customerRepository.findById(id, { populate: POPULATE });
  if (!customer) throw new ApiError(404, 'Customer not found');
  if (
    actor.role !== ROLES.ADMIN &&
    customer.assignedSalesperson &&
    String(customer.assignedSalesperson?._id || customer.assignedSalesperson) !== String(actor._id) &&
    String(customer.createdBy?._id || customer.createdBy) !== String(actor._id)
  ) {
    throw new ApiError(403, 'You do not have permission to view this customer');
  }
  return customer;
}

async function create(data, actorId) {
  const payload = buildPayload(data);
  if (!payload.assignedSalesperson && actorId) {
    payload.assignedSalesperson = actorId;
  }
  await assertSalesperson(payload.assignedSalesperson);

  const matches = await duplicateHits(payload);
  if (matches.length && !data.confirmDuplicates) {
    throw new ApiError(409, 'Possible duplicate customer', matches);
  }
  if (matches.length && !payload.overrideReason) {
    throw new ApiError(400, 'Override reason is required when saving a possible duplicate');
  }

  return customerRepository.create({ ...payload, createdBy: actorId, updatedBy: actorId });
}

async function update(id, data, actorId) {
  const existing = await customerRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Customer not found');

  const payload = buildPayload({ ...existing.toObject(), ...data });
  await assertSalesperson(payload.assignedSalesperson);

  const matches = await duplicateHits(payload, id);
  if (matches.length && !data.confirmDuplicates) {
    throw new ApiError(409, 'Possible duplicate customer', matches);
  }
  if (matches.length && !payload.overrideReason) {
    throw new ApiError(400, 'Override reason is required when saving a possible duplicate');
  }

  const customer = await customerRepository.updateById(id, { ...payload, updatedBy: actorId });
  return customerRepository.findById(customer._id, { populate: POPULATE });
}

async function remove(id) {
  const customer = await customerRepository.deleteById(id);
  if (!customer) throw new ApiError(404, 'Customer not found');
}

module.exports = { list, getById, create, update, remove };
