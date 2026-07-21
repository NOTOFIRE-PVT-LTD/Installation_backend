const whatsappLogService = require('../services/whatsappLog.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listLogs = asyncHandler(async (req, res) => {
  const result = await whatsappLogService.list(req.query);
  sendSuccess(res, { message: 'WhatsApp logs fetched', data: result.items, meta: result });
});

const getStatus = asyncHandler(async (req, res) => {
  const status = await whatsappLogService.getSetupStatus();
  sendSuccess(res, { message: 'WhatsApp setup status fetched', data: status });
});

module.exports = { listLogs, getStatus };
