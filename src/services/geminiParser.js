const { GoogleGenerativeAI } = require('@google/generative-ai');

const FIELD_GUIDE = {
  po: `This is a PURCHASE ORDER (PO).
Extract:
- poNumber: the PO number (e.g. "CI4PO05788")
- poDate: the PO date in ISO format YYYY-MM-DD
- vendorName: the vendor / supplier name
- items: array of line items, each with:
    - sku: the item code / SKU / item number (string)
    - description: the item description
    - quantity: the ordered quantity (number)`,

  grn: `This is a GOODS RECEIPT NOTE (GRN).
Extract:
- poNumber: the referenced PO number (e.g. "CI4PO05788")
- grnNumber: the GRN number
- grnDate: the GRN date in ISO format YYYY-MM-DD
- vendorName: the vendor / supplier name
- items: array of line items, each with:
    - sku: the item code / SKU code (string)
    - description: the item description
    - receivedQuantity: the received quantity (the "Recv Qty" column, number)`,

  invoice: `This is a TAX INVOICE.
Extract:
- poNumber: the customer order number / PO number it references (e.g. "CI4PO05788")
- invoiceNumber: the invoice number
- invoiceDate: the invoice date in ISO format YYYY-MM-DD
- vendorName: the seller / vendor name
- items: array of line items, each with:
    - sku: the item code / SKU (string). If the invoice only has an internal
      "Item Code" like "FG-P-F-0503", use that. Prefer a numeric SKU if present.
    - description: the item description
    - quantity: the billed quantity (number)`,
};

const RESPONSE_SHAPE = `
Return ONLY a JSON object (no markdown fences, no commentary) with this shape:
{
  "poNumber": string | null,
  "grnNumber": string | null,
  "invoiceNumber": string | null,
  "poDate": string | null,
  "grnDate": string | null,
  "invoiceDate": string | null,
  "vendorName": string | null,
  "items": [
    { "sku": string | null, "description": string | null,
      "quantity": number | null, "receivedQuantity": number | null }
  ]
}
Rules:
- Dates MUST be ISO format "YYYY-MM-DD". Convert from any source format (e.g. "17-3-2026" -> "2026-03-17").
- Quantities MUST be plain numbers (no commas, no units).
- Include every line item you can see in the table.
- Fields that do not apply to this document type should be null.`;

function buildPrompt(documentType) {
  return `${FIELD_GUIDE[documentType]}\n${RESPONSE_SHAPE}`;
}

async function generateWithRetry(model, parts, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await model.generateContent(parts);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      const transient = /\b(503|429)\b/.test(err.message || '');
      if (!transient || i === attempts - 1) break;
      const delayMs = 1000 * 2 ** i;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

async function parseDocument(buffer, mimeType, documentType) {
  if (!['po', 'grn', 'invoice'].includes(documentType)) {
    throw new Error(`Unsupported documentType: ${documentType}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Set it in .env (see .env.example).');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  const parts = [
    { text: buildPrompt(documentType) },
    { inlineData: { mimeType: mimeType || 'application/pdf', data: buffer.toString('base64') } },
  ];

  const text = await generateWithRetry(model, parts);
  try {
    return extractJson(text);
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${err.message}\nRaw: ${text.slice(0, 500)}`);
  }
}

module.exports = { parseDocument, buildPrompt };
