const callLetterService = require('../services/callLetter.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await callLetterService.list(req.query);
  sendSuccess(res, { message: 'Call letters fetched', data: result.items, meta: result });
});

const getById = asyncHandler(async (req, res) => {
  const doc = await callLetterService.getById(req.params.id);
  sendSuccess(res, { message: 'Call letter fetched', data: doc });
});

const create = asyncHandler(async (req, res) => {
  const doc = await callLetterService.create(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Call letter created', data: doc });
});

const update = asyncHandler(async (req, res) => {
  const doc = await callLetterService.update(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Call letter updated', data: doc });
});

const remove = asyncHandler(async (req, res) => {
  await callLetterService.remove(req.params.id);
  sendSuccess(res, { message: 'Call letter deleted' });
});

const parsePdf = asyncHandler(async (req, res) => {
  const extracted = await callLetterService.parsePdf(req.file);
  sendSuccess(res, { message: 'Call letter PDF extracted with Gemini AI', data: extracted });
});

const exportExcelById = asyncHandler(async (req, res) => {
  const buffer = await callLetterService.exportExcelById(req.params.id);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="call-letter-rdso-${stamp}.xlsx"`);
  res.send(Buffer.from(buffer));
});

const exportExcelDirect = asyncHandler(async (req, res) => {
  const buffer = await callLetterService.exportExcelDirect(req.body || {});
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="call-letter-rdso-${stamp}.xlsx"`);
  res.send(Buffer.from(buffer));
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  parsePdf,
  exportExcelById,
  exportExcelDirect,
};
