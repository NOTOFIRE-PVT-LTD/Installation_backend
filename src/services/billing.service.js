const ExcelJS = require('exceljs');
const billingInvoiceRepository = require('../repositories/billingInvoice.repository');
const { BILLING_PARTIES } = require('../models/BillingInvoice.model');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const MAX_TEXT_CHARS = 120_000;
const DISCOUNT_PERCENT = 55.7;
const GST_RATE = 18;
const POPULATE = [{ path: 'createdBy', select: 'name email' }];
const SORT_FIELDS = ['createdAt', 'totalAfterDiscount', 'loaValue'];

function roundMoney(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').replace(/[₹rs\s]/gi, ''));
  return Number.isFinite(n) ? n : 0;
}

function shortenItemName(name) {
  let text = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  text = text.replace(/^(?:supply|providing|installation|erection)\s+of\s+/i, '').trim();
  text = text.split(/\s+with the following\b/i)[0];
  text = text.split(/\s+having the following\b/i)[0];
  text = text.split(/\s+as per\b/i)[0];
  text = text.split(/\s+\d+\.\s+/)[0];
  text = text.replace(/[.;,:]+$/g, '').trim();
  if (text.length > 72) {
    const clause = text.split(/\s+-\s+|\s+–\s+/)[0].trim();
    text = clause.length >= 8 && clause.length < text.length ? clause : text.slice(0, 72).trim();
  }
  return text;
}

function trimPdfText(text) {
  const raw = String(text || '').replace(/\u0000/g, '').trim();
  if (!raw) throw new ApiError(400, 'LOA PDF text is empty');
  if (raw.length <= MAX_TEXT_CHARS) return raw;
  return `${raw.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated for length]`;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new ApiError(502, 'AI returned an empty response');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ApiError(502, 'AI response was not valid JSON');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ApiError(502, 'AI response was not valid JSON');
  }
}

const SYSTEM_PROMPT = `You extract LOA / award schedule line items from Indian railway tender or LOA PDF text.
Return ONLY valid JSON (no markdown) with this shape:
{
  "loaNumber": string,
  "tenderValue": number|null,
  "loaValue": number|null,
  "docDate": string|null,
  "items": [
    {
      "itemName": string,
      "quantity": number|null,
      "unit": string|null,
      "loaValuePerUnit": number|null,
      "type": string|null,
      "paymentTerms": string|null,
      "inspection": string|null,
      "mfd": string|null
    }
  ],
  "notes": string
}

Field mapping:
- itemName: short main name from Item Desc / Item Description / Description (e.g. "Control Panel", "MCP", "Hooter"). Do NOT paste full specs.
- quantity: Item Qty / Qty / Quantity
- unit: Qty Unit / Unit (Nos, Mtr, etc.)
- loaValuePerUnit: Unit Rate / Unit Rate(Rs) / Bid Rate / Rate
- Prefer real item rows. Skip schedule headers and totals.
- Do not invent rows. Use null when missing.`;

async function callGemini(text, apiKey) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nLOA PDF TEXT:\n${text}` }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, payload?.error?.message || `Gemini request failed (${response.status})`);
  }
  const content = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '';
  return extractJsonObject(content);
}

async function callOpenAi(text, apiKey) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `LOA PDF TEXT:\n${text}` },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, payload?.error?.message || `OpenAI request failed (${response.status})`);
  }
  return extractJsonObject(payload?.choices?.[0]?.message?.content || '');
}

async function parseLoaTextWithAi(pdfText) {
  const text = trimPdfText(pdfText);
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!geminiKey && !openAiKey) {
    throw new ApiError(
      503,
      'AI parsing is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the Backend .env file.'
    );
  }
  return geminiKey ? callGemini(text, geminiKey) : callOpenAi(text, openAiKey);
}

function buildCalculatedItem(raw, index, discountPercent = DISCOUNT_PERCENT) {
  const quantity = roundMoney(toNumber(raw.quantity), 4);
  const loaValuePerUnit = roundMoney(toNumber(raw.loaValuePerUnit), 4);
  const loaTotal = roundMoney(quantity * loaValuePerUnit, 4);
  // LOA Value Per Unit - LOA Value Per Unit * 55.7%
  const discountPerUnit = roundMoney(loaValuePerUnit - loaValuePerUnit * (discountPercent / 100), 4);
  const discountTotal = roundMoney(discountPerUnit * quantity, 4);

  return {
    sno: index + 1,
    itemName: shortenItemName(raw.itemName || raw.description || raw.name),
    type: String(raw.type || 'SITC').trim() || 'SITC',
    paymentTerms: String(raw.paymentTerms || '80% + 10% + 10%').trim() || '80% + 10% + 10%',
    inspection: String(raw.inspection || 'RDSO').trim() || 'RDSO',
    mfd: String(raw.mfd || 'NF').trim() || 'NF',
    quantity,
    unit: String(raw.unit || 'Nos').trim() || 'Nos',
    loaValuePerUnit,
    loaTotal,
    discountPerUnit,
    discountTotal,
  };
}

function buildSummary(items) {
  const totalAfterDiscount = roundMoney(
    items.reduce((sum, item) => sum + toNumber(item.discountTotal), 0),
    4
  );
  const excludingGst = roundMoney(totalAfterDiscount / (1 + GST_RATE / 100), 4);
  const gstAmount = roundMoney(totalAfterDiscount - excludingGst, 4);
  return { totalAfterDiscount, excludingGst, gstAmount };
}

function normalizeParsedLoa(parsed, { party, fileName }) {
  if (!BILLING_PARTIES.includes(party)) {
    throw new ApiError(400, 'Invalid billing party. Use KE, AHT, or Arihant.');
  }

  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((row, index) => buildCalculatedItem(row, index, DISCOUNT_PERCENT))
    .filter((item) => item.itemName && item.quantity > 0);

  if (!items.length) {
    throw new ApiError(400, 'AI could not find LOA item rows (Item Desc / Qty / Unit Rate) in that PDF.');
  }

  const summary = buildSummary(items);
  let docDate = null;
  if (parsed.docDate) {
    const d = new Date(parsed.docDate);
    if (!Number.isNaN(d.getTime())) docDate = d;
  }

  return {
    party,
    fileName: String(fileName || '').trim(),
    loaNumber: String(parsed.loaNumber || '').trim(),
    tenderValue: roundMoney(toNumber(parsed.tenderValue), 2),
    loaValue: roundMoney(toNumber(parsed.loaValue) || summary.totalAfterDiscount, 2),
    docDate,
    discountPercent: DISCOUNT_PERCENT,
    items,
    ...summary,
    notes: String(parsed.notes || '').trim(),
  };
}

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, SORT_FIELDS, { createdAt: -1 });
  const filter = {};
  if (query.party && BILLING_PARTIES.includes(query.party)) filter.party = query.party;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fileName: regex }, { loaNumber: regex }, { notes: regex }, { 'items.itemName': regex }];
  }

  const { items, total } = await billingInvoiceRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: POPULATE,
  });
  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getById(id) {
  const item = await billingInvoiceRepository.findById(id, { populate: POPULATE });
  if (!item) throw new ApiError(404, 'Billing LOA not found');
  return item;
}

async function createFromLoaText({ text, fileName, party }, actorId) {
  const parsed = await parseLoaTextWithAi(text);
  const payload = normalizeParsedLoa(parsed, { party, fileName });
  const created = await billingInvoiceRepository.create({
    ...payload,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return getById(created._id);
}

async function remove(id) {
  const existing = await billingInvoiceRepository.findById(id);
  if (!existing) throw new ApiError(404, 'Billing LOA not found');
  await billingInvoiceRepository.deleteById(id);
  return { _id: id };
}

async function buildExcel(query = {}) {
  const filter = {};
  if (query.party && BILLING_PARTIES.includes(query.party)) filter.party = query.party;
  if (query.ids) {
    const ids = Array.isArray(query.ids)
      ? query.ids
      : String(query.ids)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
    if (ids.length) filter._id = { $in: ids };
  }

  const docs = await billingInvoiceRepository.find(filter, { sort: { createdAt: -1 } });
  if (!docs.length) throw new ApiError(404, 'No billing rows to export');

  const workbook = new ExcelJS.Workbook();

  docs.forEach((doc, docIndex) => {
    const sheetName = `${doc.party}-${docIndex + 1}`.slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: 'S. No.', key: 'sno', width: 8 },
      { header: 'Description', key: 'itemName', width: 28 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Payment Terms', key: 'paymentTerms', width: 16 },
      { header: 'Inspection', key: 'inspection', width: 12 },
      { header: 'MFD', key: 'mfd', width: 8 },
      { header: 'Qty', key: 'quantity', width: 10 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'LOA Value Per Unit', key: 'loaValuePerUnit', width: 18 },
      { header: 'LOA Total', key: 'loaTotal', width: 14 },
      {
        header: 'Below 55.70% - discount/rebate Per Unit = after discount',
        key: 'discountPerUnit',
        width: 28,
      },
      {
        header: 'Below 55.70% Total - discount/rebate(whole unit) after discount',
        key: 'discountTotal',
        width: 30,
      },
    ];
    sheet.getRow(1).font = { bold: true };

    (doc.items || []).forEach((item) => {
      sheet.addRow({
        sno: item.sno,
        itemName: item.itemName,
        type: item.type,
        paymentTerms: item.paymentTerms,
        inspection: item.inspection,
        mfd: item.mfd,
        quantity: item.quantity,
        unit: item.unit,
        loaValuePerUnit: item.loaValuePerUnit,
        loaTotal: item.loaTotal,
        discountPerUnit: item.discountPerUnit,
        discountTotal: item.discountTotal,
      });
    });

    sheet.addRow({});
    sheet.addRow({ itemName: 'Total', discountTotal: doc.totalAfterDiscount });
    sheet.addRow({ itemName: 'Excluding GST', discountTotal: doc.excludingGst });
    sheet.addRow({ itemName: 'GST 18%', discountTotal: doc.gstAmount });
    sheet.addRow({});
    sheet.addRow({ itemName: 'Tender Value', discountTotal: doc.tenderValue });
    sheet.addRow({ itemName: 'LOA Value', discountTotal: doc.loaValue });
    sheet.addRow({
      itemName: 'DOC',
      discountTotal: doc.docDate ? new Date(doc.docDate).toISOString().slice(0, 10) : '',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  list,
  getById,
  createFromLoaText,
  remove,
  buildExcel,
  BILLING_PARTIES,
  DISCOUNT_PERCENT,
};
