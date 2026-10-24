const auditLogRepository = require('../repositories/auditLog.repository');
const AuditLog = require('../models/AuditLog.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildPaginatedResult } = require('../utils/pagination');

function escapeRegex(text) {
  return String(text).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Creates an audit log entry safely without throwing or interrupting the calling flow.
 */
async function recordLog(data = {}) {
  try {
    console.log("data", data);
    return await auditLogRepository.create({
      action: data.action,
      module: data.module || 'System',
      description: data.description || 'Action performed',
      user: data.user || null,
      userName: data.userName || 'System',
      userEmail: data.userEmail || '',
      userRole: data.userRole || '',
      entityId: data.entityId ? String(data.entityId) : null,
      entityName: data.entityName ? String(data.entityName) : '',
      method: data.method || '',
      endpoint: data.endpoint || '',
      statusCode: Number(data.statusCode) || 200,
      ipAddress: data.ipAddress || '',
      userAgent: data.userAgent || '',
      details: data.details || {},
    });
  } catch (err) {
    // Audit logging should never bring down core operations
    console.error('[AuditLog] Failed to record audit log:', err.message);
    return null;
  }
}

/**
 * Lists audit logs with searching, module, action, user, and date range filters.
 */
async function listLogs(query = {}) {
  const { page, pageSize, skip } = buildPagination(query, { maxPageSize: 100 });
  const filter = {};
  const andClauses = [];

  // Keyword search
  const search = String(query.search || '').trim();
  if (search) {
    const terms = search.split(/\s+/).filter(Boolean);
    terms.forEach((term) => {
      const regex = new RegExp(escapeRegex(term), 'i');
      andClauses.push({
        $or: [
          { description: regex },
          { module: regex },
          { userName: regex },
          { userEmail: regex },
          { entityName: regex },
          { ipAddress: regex },
          { endpoint: regex },
        ],
      });
    });
  }

  // Module filter
  if (query.module && query.module !== 'ALL') {
    filter.module = query.module;
  }

  // Action filter
  if (query.action && query.action !== 'ALL') {
    filter.action = query.action;
  }

  // User filter
  if (query.user) {
    filter.user = query.user;
  }

  // Date range filters
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) {
      const start = new Date(query.startDate);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
  }

  if (andClauses.length) {
    filter.$and = andClauses;
  }

  const { items, total } = await auditLogRepository.paginate({
    filter,
    sort: { createdAt: -1 },
    skip,
    limit: pageSize,
    populate: { path: 'user', select: 'name email role profileImage' },
  });

  return buildPaginatedResult({ items, total, page, pageSize });
}

/**
 * Retrieves a single audit log by ID.
 */
async function getLogById(id) {
  const log = await auditLogRepository.findById(id, {
    populate: { path: 'user', select: 'name email role profileImage mobileNumber' },
  });
  if (!log) throw new ApiError(404, 'Audit log entry not found');
  return log;
}

/**
 * Summary metrics for dashboard/stat cards.
 */
async function getStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, today, creates, updates, deletes, logins] = await Promise.all([
    AuditLog.countDocuments({}),
    AuditLog.countDocuments({ createdAt: { $gte: startOfToday } }),
    AuditLog.countDocuments({ action: 'CREATE' }),
    AuditLog.countDocuments({ action: { $in: ['UPDATE', 'STATUS_CHANGE'] } }),
    AuditLog.countDocuments({ action: 'DELETE' }),
    AuditLog.countDocuments({ action: 'LOGIN' }),
  ]);

  return {
    total,
    today,
    creates,
    updates,
    deletes,
    logins,
  };
}

/**
 * Returns distinct modules list for frontend filter dropdown.
 */
async function getModulesList() {
  const modules = await AuditLog.distinct('module');
  return modules.filter(Boolean).sort();
}

module.exports = {
  recordLog,
  listLogs,
  getLogById,
  getStats,
  getModulesList,
};
