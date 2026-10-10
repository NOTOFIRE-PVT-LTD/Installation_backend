const proformaInvoiceService = require('../services/proformaInvoice.service');
const quotationService = require('../services/quotation.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

function quotationScope(user) {
  if (!user?.permissions?.quotationsOwnOnly) return null;
  return { userId: user._id, userName: user.name };
}

const listProformaInvoices = asyncHandler(async (req, res) => {
  const { items, ...meta } = await proformaInvoiceService.listProformaInvoices(req.query);
  sendSuccess(res, { message: 'Proforma Invoices fetched', data: items, meta });
});

const getProformaInvoiceById = asyncHandler(async (req, res) => {
  const pi = await proformaInvoiceService.getProformaInvoiceById(req.params.id);
  sendSuccess(res, { message: 'Proforma Invoice fetched', data: pi });
});

const createProformaInvoice = asyncHandler(async (req, res) => {
  const pi = await proformaInvoiceService.createProformaInvoice(req.body, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'Proforma Invoice created', data: pi });
});

const updateProformaInvoice = asyncHandler(async (req, res) => {
  const pi = await proformaInvoiceService.updateProformaInvoice(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Proforma Invoice updated', data: pi });
});

const removeProformaInvoice = asyncHandler(async (req, res) => {
  await proformaInvoiceService.removeProformaInvoice(req.params.id);
  sendSuccess(res, { message: 'Proforma Invoice deleted' });
});

const suggestNumber = asyncHandler(async (req, res) => {
  const result = await proformaInvoiceService.suggestNumber(req.query);
  sendSuccess(res, { message: 'PI number suggested', data: result });
});

const listCompanies = asyncHandler(async (_req, res) => {
  const items = await quotationService.listMasters('company');
  sendSuccess(res, { message: 'Companies fetched', data: items });
});

const listParties = asyncHandler(async (_req, res) => {
  const items = await quotationService.listMasters('party');
  sendSuccess(res, { message: 'Parties fetched', data: items });
});

const listQuotations = asyncHandler(async (req, res) => {
  const { items, counts, ...meta } = await quotationService.listQuotations(
    { search: req.query.search, page: req.query.page || 1, pageSize: req.query.pageSize || 50, trash: 'false' },
    quotationScope(req.user)
  );
  sendSuccess(res, { message: 'Quotations fetched', data: items, meta });
});

const getQuotation = asyncHandler(async (req, res) => {
  const quotation = await quotationService.getQuotationById(req.params.id, quotationScope(req.user));
  sendSuccess(res, { message: 'Quotation fetched', data: quotation });
});

module.exports = {
  listProformaInvoices,
  getProformaInvoiceById,
  createProformaInvoice,
  updateProformaInvoice,
  removeProformaInvoice,
  suggestNumber,
  listCompanies,
  listParties,
  listQuotations,
  getQuotation,
};
