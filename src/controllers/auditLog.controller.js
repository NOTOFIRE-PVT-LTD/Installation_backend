const auditLogService = require('../services/auditLog.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await auditLogService.listLogs(req.query);
  sendSuccess(res, {
    message: 'Audit logs fetched',
    data: result.items,
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
  });
});

const getById = asyncHandler(async (req, res) => {
  const log = await auditLogService.getLogById(req.params.id);
  sendSuccess(res, { message: 'Audit log fetched', data: log });
});

const getStats = asyncHandler(async (_req, res) => {
  const stats = await auditLogService.getStats();
  sendSuccess(res, { message: 'Audit stats fetched', data: stats });
});

const getModules = asyncHandler(async (_req, res) => {
  const modules = await auditLogService.getModulesList();
  sendSuccess(res, { message: 'Modules fetched', data: modules });
});

module.exports = {
  list,
  getById,
  getStats,
  getModules,
};
