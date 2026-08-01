const nitTenderService = require('../services/nitTender.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../utils/logger');

const list = asyncHandler(async (req, res) => {
  const result = await nitTenderService.list(req.query);
  sendSuccess(res, { message: 'Tenders fetched', data: result.items, meta: result });
});

const options = asyncHandler(async (req, res) => {
  const items = await nitTenderService.options();
  sendSuccess(res, { message: 'Tender LOA options fetched', data: items });
});

const getById = asyncHandler(async (req, res) => {
  const tender = await nitTenderService.getById(req.params.id);
  sendSuccess(res, { message: 'Tender fetched', data: tender });
});

const create = asyncHandler(async (req, res) => {
  const tender = await nitTenderService.create(req.body, req.user._id);

  // Fire-and-forget WhatsApp notifications (do not fail Tender creation).
  whatsappNotificationService
    .notifyTenderCreated({ tender, submittedBy: req.user })
    .catch((err) => logger.error('[whatsapp] Tender notification failed:', err.message));

  sendSuccess(res, { statusCode: 201, message: 'Tender created', data: tender });
});

const update = asyncHandler(async (req, res) => {
  const tender = await nitTenderService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Tender updated', data: tender });
});

const remove = asyncHandler(async (req, res) => {
  await nitTenderService.remove(req.params.id);
  sendSuccess(res, { message: 'Tender deleted' });
});

module.exports = { list, options, getById, create, update, remove };
