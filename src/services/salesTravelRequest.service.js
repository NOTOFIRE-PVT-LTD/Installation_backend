const salesTravelRequestRepository = require('../repositories/salesTravelRequest.repository');
const SalesTravelRequest = require('../models/SalesTravelRequest.model');
const uploadService = require('./upload.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');

const MAX_PAGE_SIZE = 200;
const POPULATE_FIELDS = [
  { path: 'createdBy', select: 'name email mobileNumber role' },
  { path: 'reviewedBy', select: 'name email' },
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

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPersonsToMeet(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .filter((row) => row && (text(row.name) || text(row.company) || text(row.designation)))
    .map((row) => ({
      name: text(row.name),
      designation: text(row.designation),
      company: text(row.company),
      city: text(row.city),
      contactNumber: text(row.contactNumber),
      email: text(row.email),
      nextAction: text(row.nextAction),
      purposeOfMeeting: text(row.purposeOfMeeting),
      notesAboutPerson: text(row.notesAboutPerson),
      meetingOutcome: text(row.meetingOutcome),
    }));
}

function buildTravelItinerary(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .filter(
      (row) =>
        row &&
        (row.date ||
          text(row.from) ||
          text(row.to) ||
          text(row.modeOfTravel) ||
          text(row.availability) ||
          num(row.cost) > 0 ||
          text(row.trainOrFlightDetails))
    )
    .map((row) => ({
      date: toDate(row.date),
      from: text(row.from),
      to: text(row.to),
      modeOfTravel: text(row.modeOfTravel),
      availability: text(row.availability),
      cost: round2(num(row.cost)),
      trainOrFlightDetails: text(row.trainOrFlightDetails),
    }));
}

async function uploadProof(file) {
  const uploaded = await uploadService.uploadCadFile(file);
  return {
    url: uploaded.url,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
  };
}

async function deleteProofs(proofs = []) {
  await Promise.all(
    proofs
      .filter((proof) => proof?.publicId)
      .map((proof) => uploadService.deleteAsset(proof.publicId, proof.resourceType || 'image'))
  );
}

async function buildTripExpenses(raw, files = [], existingExpenses = []) {
  const existingProofs = new Map();
  existingExpenses.forEach((expense) => {
    if (expense.proof?._id) existingProofs.set(String(expense.proof._id), expense.proof);
  });

  const keptIds = new Set();
  const uploaded = [];
  const expenses = [];

  try {
    for (const row of Array.isArray(raw) ? raw : []) {
      const hasFile = Number.isInteger(row?.newProofIndex) && Boolean(files[row.newProofIndex]);
      const hasKeptProof = Boolean(row?.keepProofId && existingProofs.has(String(row.keepProofId)));
      const hasData =
        Boolean(row?.date) ||
        num(row?.amount) > 0 ||
        Boolean(text(row?.expenseDetail)) ||
        hasFile ||
        hasKeptProof;

      if (!hasData) continue;

      let proof = null;
      const index = row.newProofIndex;
      if (Number.isInteger(index) && files[index]) {
        proof = await uploadProof(files[index]);
        uploaded.push(proof);
      } else if (
        row.keepProofId &&
        existingProofs.has(String(row.keepProofId)) &&
        !keptIds.has(String(row.keepProofId))
      ) {
        keptIds.add(String(row.keepProofId));
        proof = existingProofs.get(String(row.keepProofId)).toObject();
      }

      expenses.push({
        date: toDate(row.date),
        amount: round2(num(row.amount)),
        expenseDetail: text(row.expenseDetail),
        proof,
      });
    }
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }

  const dropped = [...existingProofs.entries()]
    .filter(([id]) => !keptIds.has(id))
    .map(([, proof]) => proof);

  return { expenses, uploaded, dropped };
}

function validate(data, personsToMeet) {
  if (!text(data.cityTravellingTo)) {
    throw new ApiError(400, 'City Travelling To is required');
  }
  if (!text(data.travellerName)) {
    throw new ApiError(400, 'Name of Person (Travelling) is required');
  }
  if (!personsToMeet.length || personsToMeet.some((p) => !p.name)) {
    throw new ApiError(400, 'At least one Person to Meet with Name is required');
  }
}

function buildFields(data, personsToMeet, travelItinerary, tripExpenses) {
  const travelCostSubtotal = round2(travelItinerary.reduce((sum, row) => sum + row.cost, 0));
  const dayWiseTotal = round2(tripExpenses.reduce((sum, row) => sum + row.amount, 0));
  const grandTotal = round2(travelCostSubtotal + dayWiseTotal);

  return {
    travelFrom: toDate(data.travelFrom),
    travelTo: toDate(data.travelTo),
    cityTravellingTo: text(data.cityTravellingTo),
    travellerName: text(data.travellerName),
    agenda: text(data.agenda),
    personsToMeet,
    travelItinerary,
    travelCostSubtotal,
    tripExpenses,
    dayWiseTotal,
    grandTotal,
    expectedRoi: text(data.expectedRoi),
  };
}

function withOwner(filter, scope) {
  if (!scope?.userId) return filter;
  return { ...filter, createdBy: scope.userId };
}

function isOwner(doc, scope) {
  if (!scope?.userId) return true;
  const creatorId = doc.createdBy?._id || doc.createdBy;
  return Boolean(creatorId) && String(creatorId) === String(scope.userId);
}

async function listSalesTravelRequests(query = {}, scope = null) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: MAX_PAGE_SIZE });
  const filter = {};

  if (query.status && SalesTravelRequest.SALES_TRAVEL_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }

  const terms = text(query.search).split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      return {
        $or: [
          { cityTravellingTo: regex },
          { travellerName: regex },
          { agenda: regex },
          { 'personsToMeet.name': regex },
          { 'personsToMeet.company': regex },
        ],
      };
    });
  }

  const finalFilter = withOwner(filter, scope);
  const { items, total } = await salesTravelRequestRepository.paginate({
    filter: finalFilter,
    sort: { createdAt: -1 },
    skip,
    limit: pageSize,
    populate: POPULATE_FIELDS,
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getSalesTravelRequestById(id, scope = null) {
  const doc = await salesTravelRequestRepository.findById(id, { populate: POPULATE_FIELDS });
  if (!doc || !isOwner(doc, scope)) {
    throw new ApiError(404, 'Sales travel request not found');
  }
  return doc;
}

async function createSalesTravelRequest(data, files = [], actorId, scope = null) {
  if (scope?.userName && !text(data.travellerName)) {
    data.travellerName = scope.userName;
  }
  const personsToMeet = buildPersonsToMeet(data.personsToMeet);
  validate(data, personsToMeet);
  const travelItinerary = buildTravelItinerary(data.travelItinerary);
  const { expenses, uploaded } = await buildTripExpenses(data.tripExpenses, files);

  try {
    const created = await salesTravelRequestRepository.create({
      ...buildFields(data, personsToMeet, travelItinerary, expenses),
      createdBy: actorId,
      updatedBy: actorId,
    });
    return salesTravelRequestRepository.findById(created._id, { populate: POPULATE_FIELDS });
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }
}

async function updateSalesTravelRequest(id, data, files = [], actorId, scope = null) {
  const existing = await getSalesTravelRequestById(id, scope);
  if (scope?.userName && !text(data.travellerName)) {
    data.travellerName = existing.travellerName || scope.userName;
  }
  const personsToMeet = buildPersonsToMeet(data.personsToMeet);
  validate(data, personsToMeet);
  const travelItinerary = buildTravelItinerary(data.travelItinerary);
  const { expenses, uploaded, dropped } = await buildTripExpenses(
    data.tripExpenses,
    files,
    existing.tripExpenses
  );

  let saved;
  try {
    await salesTravelRequestRepository.updateById(id, {
      ...buildFields(data, personsToMeet, travelItinerary, expenses),
      updatedBy: actorId,
    });
    saved = await salesTravelRequestRepository.findById(id, { populate: POPULATE_FIELDS });
  } catch (err) {
    await deleteProofs(uploaded);
    throw err;
  }
  await deleteProofs(dropped);
  return saved;
}

async function updateSalesTravelRequestStatus(id, { status, adminRemark, adminRating }, actorId) {
  const existing = await salesTravelRequestRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Sales travel request not found');

  const nextStatus = status || existing.status || 'Pending';
  if (!SalesTravelRequest.SALES_TRAVEL_STATUSES.includes(nextStatus)) {
    throw new ApiError(400, 'Invalid status');
  }

  let parsedRating = existing.adminRating ?? null;
  if (adminRating !== undefined) {
    const r = Number(adminRating);
    parsedRating = Number.isFinite(r) && r >= 1 && r <= 5 ? Math.round(r) : null;
  }

  await salesTravelRequestRepository.updateById(id, {
    status: nextStatus,
    adminRemark: adminRemark !== undefined ? text(adminRemark) : existing.adminRemark,
    adminRating: parsedRating,
    reviewedBy: actorId,
    reviewedAt: new Date(),
    updatedBy: actorId,
  });
  return salesTravelRequestRepository.findById(id, { populate: POPULATE_FIELDS });
}

async function removeSalesTravelRequest(id, scope = null) {
  const existing = await getSalesTravelRequestById(id, scope);
  await salesTravelRequestRepository.deleteById(id);
  await deleteProofs(existing.tripExpenses.map((expense) => expense.proof));
}

module.exports = {
  listSalesTravelRequests,
  getSalesTravelRequestById,
  createSalesTravelRequest,
  updateSalesTravelRequest,
  updateSalesTravelRequestStatus,
  removeSalesTravelRequest,
};

