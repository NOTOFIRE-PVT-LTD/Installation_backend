function buildPagination(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function buildSort(query, allowedFields = [], defaultSort = { createdAt: -1 }) {
  const { sortField, sortOrder } = query;
  if (sortField && allowedFields.includes(sortField)) {
    return { [sortField]: sortOrder === 'asc' ? 1 : -1 };
  }
  return defaultSort;
}

function buildPaginatedResult({ items, total, page, pageSize }) {
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
}

module.exports = { buildPagination, buildSort, buildPaginatedResult };
