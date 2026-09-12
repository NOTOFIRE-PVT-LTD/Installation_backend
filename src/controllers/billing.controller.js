const billingService = require('../services/billing.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await billingService.list(req.query);
  sendSuccess(res, { message: 'Billing LOAs fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const item = await billingService.getById(req.params.id);
  sendSuccess(res, { message: 'Billing LOA fetched', data: item });
});

const parseLoa = asyncHandler(async (req, res) => {
  const item = await billingService.createFromLoaText(
    {
      text: req.body?.text,
      fileName: req.body?.fileName,
      party: req.body?.party,
    },
    req.user._id
  );
  sendSuccess(res, { statusCode: 201, message: 'LOA parsed and saved', data: item });
});

const remove = asyncHandler(async (req, res) => {
  await billingService.remove(req.params.id);
  sendSuccess(res, { message: 'Billing LOA deleted' });
});

const downloadExcel = asyncHandler(async (req, res) => {
  const buffer = await billingService.buildExcel(req.query);
  const party = req.query.party ? String(req.query.party).toLowerCase() : 'all';
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="billing-${party}.xlsx"`);
  res.send(buffer);
});

module.exports = {
  list,
  getById,
  parseLoa,
  remove,
  downloadExcel,
};
