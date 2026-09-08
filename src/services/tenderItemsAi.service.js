const ApiError = require('../utils/ApiError');

const MAX_TEXT_CHARS = 120_000;

function trimPdfText(text) {
  const raw = String(text || '').replace(/\u0000/g, '').trim();
  if (!raw) throw new ApiError(400, 'PDF text is empty');
  if (raw.length <= MAX_TEXT_CHARS) return raw;
  return `${raw.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated for length]`;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const itemName = String(item?.itemName || item?.name || item?.description || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!itemName) return null;

      const quantityRaw = item?.quantity ?? item?.qty ?? item?.itemQty;
      const amountRaw = item?.amount ?? item?.bidAmount ?? item?.advtValue ?? item?.value;

      const quantity =
        quantityRaw === null || quantityRaw === undefined || quantityRaw === ''
          ? null
          : Number(String(quantityRaw).replace(/,/g, ''));
      const amount =
        amountRaw === null || amountRaw === undefined || amountRaw === ''
          ? null
          : Number(String(amountRaw).replace(/,/g, ''));

      return {
        itemName,
        quantity: Number.isFinite(quantity) ? quantity : null,
        amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
      };
    })
    .filter(Boolean);
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

const SYSTEM_PROMPT = `You extract line items from Indian railway / government tender PDF text.
Return ONLY valid JSON (no markdown) with this shape:
{
  "items": [
    { "itemName": string, "quantity": number|null, "amount": number|null }
  ],
  "amountUnit": "" | "lakh" | "crore",
  "notes": string
}

Rules:
- Prefer real supply/work item rows. Skip schedule titles, section headers, totals, page numbers, and "At Par" only rows.
- itemName: use Item Desc / Item Description / Particulars / Name of Work text. Keep it readable; you may shorten very long specs but keep the main item identity.
- quantity: from Item Qty / Qty / Quantity. Numbers only.
- amount: prefer Bid Amount (Rs) when present; else Advt. Value / Advertised Value / Amount / Total Value. Convert if the column is in lakhs or crores to absolute rupees and set amountUnit accordingly.
- If a field is missing, use null.
- Do not invent items that are not in the text.`;

async function callGemini(text, apiKey) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nPDF TEXT:\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini request failed (${response.status})`;
    throw new ApiError(502, message);
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
        { role: 'user', content: `PDF TEXT:\n${text}` },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed (${response.status})`;
    throw new ApiError(502, message);
  }

  return extractJsonObject(payload?.choices?.[0]?.message?.content || '');
}

/**
 * Uses Gemini (preferred) or OpenAI to turn tender PDF plain text into item rows.
 */
async function parseTenderItemsWithAi(pdfText) {
  const text = trimPdfText(pdfText);
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (!geminiKey && !openAiKey) {
    throw new ApiError(
      503,
      'AI parsing is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the Backend .env file.'
    );
  }

  const parsed = geminiKey ? await callGemini(text, geminiKey) : await callOpenAi(text, openAiKey);
  const items = normalizeItems(parsed.items);
  if (!items.length) {
    throw new ApiError(400, 'AI could not find any item rows in that PDF.');
  }

  return {
    items,
    amountUnit: String(parsed.amountUnit || '').toLowerCase().includes('crore')
      ? 'crore'
      : String(parsed.amountUnit || '').toLowerCase().includes('lakh')
        ? 'lakh'
        : '',
    provider: geminiKey ? 'gemini' : 'openai',
    notes: String(parsed.notes || '').trim(),
  };
}

module.exports = {
  parseTenderItemsWithAi,
};
