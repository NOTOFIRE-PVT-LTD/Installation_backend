const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const numberDirectoryRepository = require('../repositories/numberDirectory.repository');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['name', 'number', 'region', 'createdAt'];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$or = [{ name: regex }, { number: regex }, { region: regex }];
  }

  const { items, total } = await numberDirectoryRepository.paginate({ filter, sort, skip, limit: pageSize });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const entry = await numberDirectoryRepository.findById(id);
  if (!entry) throw new ApiError(404, 'Entry not found');
  return entry;
}

async function create(data, actorId) {
  const existing = await numberDirectoryRepository.findByNumberAndCategory(data.number, data.category);
  if (existing) throw new ApiError(409, 'An entry with this number already exists in this category');

  return numberDirectoryRepository.create({
    name: data.name,
    number: data.number,
    region: data.region,
    category: data.category,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

async function update(id, data, actorId) {
  const updates = { updatedBy: actorId };
  ['name', 'number', 'region'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  const entry = await numberDirectoryRepository.updateById(id, updates);
  if (!entry) throw new ApiError(404, 'Entry not found');
  return entry;
}

async function remove(id) {
  const entry = await numberDirectoryRepository.deleteById(id);
  if (!entry) throw new ApiError(404, 'Entry not found');
}

function findColumnIndex(headerRow, names) {
  let index = -1;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = String(cell.value || '').trim().toLowerCase();
    if (names.includes(value) && index === -1) index = colNumber;
  });
  return index;
}

async function parseWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  const isCsv = file.mimetype === 'text/csv' || file.originalname?.toLowerCase().endsWith('.csv');

  if (isCsv) {
    await workbook.csv.read(Readable.from(file.buffer));
  } else {
    await workbook.xlsx.load(file.buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ApiError(400, 'The uploaded file has no readable sheet');

  const headerRow = worksheet.getRow(1);
  const nameCol = findColumnIndex(headerRow, ['name']);
  const numberCol = findColumnIndex(headerRow, ['number', 'phone', 'phone number']);
  const regionCol = findColumnIndex(headerRow, ['region']);

  if (nameCol === -1 || numberCol === -1 || regionCol === -1) {
    throw new ApiError(400, 'The file must have Name, Number, and Region column headers');
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = String(row.getCell(nameCol).value || '').trim();
    const number = String(row.getCell(numberCol).value || '').trim();
    const region = String(row.getCell(regionCol).value || '').trim();
    if (name && number && region) rows.push({ name, number, region });
  });

  return rows;
}

async function bulkImport(file, category, actorId) {
  const rows = await parseWorkbook(file);
  if (rows.length === 0) {
    throw new ApiError(400, 'No valid rows found in the uploaded file');
  }

  const existing = await numberDirectoryRepository.find({ category });
  const existingNumbers = new Set(existing.map((e) => e.number));

  const seenInFile = new Set();
  const toInsert = [];
  let skipped = 0;

  rows.forEach((row) => {
    if (existingNumbers.has(row.number) || seenInFile.has(row.number)) {
      skipped += 1;
      return;
    }
    seenInFile.add(row.number);
    toInsert.push({
      name: row.name,
      number: row.number,
      region: row.region,
      category,
      createdBy: actorId,
      updatedBy: actorId,
    });
  });

  if (toInsert.length > 0) {
    await numberDirectoryRepository.model.insertMany(toInsert);
  }

  return { inserted: toInsert.length, skipped, total: rows.length };
}

module.exports = { list, getById, create, update, remove, bulkImport };
