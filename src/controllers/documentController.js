const mongoose = require('mongoose');
const Document = require('../models/Document');
const { parseDocument } = require('../services/geminiParser');
const { computeMatch } = require('../services/matchEngine');

const DOC_TYPES = ['po', 'grn', 'invoice'];

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(parsed, documentType, file) {
  const items = (parsed.items || []).map((it) => ({
    sku: it.sku != null ? String(it.sku).trim() : null,
    description: it.description != null ? String(it.description).trim() : null,
    quantity: toNumber(it.quantity),
    receivedQuantity: toNumber(it.receivedQuantity),
  }));

  return {
    documentType,
    poNumber: parsed.poNumber ? String(parsed.poNumber).trim() : null,
    grnNumber: parsed.grnNumber ? String(parsed.grnNumber).trim() : null,
    invoiceNumber: parsed.invoiceNumber ? String(parsed.invoiceNumber).trim() : null,
    poDate: toDate(parsed.poDate),
    grnDate: toDate(parsed.grnDate),
    invoiceDate: toDate(parsed.invoiceDate),
    vendorName: parsed.vendorName ? String(parsed.vendorName).trim() : null,
    items,
    fileName: file ? file.originalname : null,
    mimeType: file ? file.mimetype : null,
    rawParsed: parsed,
  };
}

async function buildMatchResult(poNumber) {
  const docs = await Document.find({ poNumber }).sort({ createdAt: 1 }).lean();
  const pos = docs.filter((d) => d.documentType === 'po');
  const grns = docs.filter((d) => d.documentType === 'grn');
  const invoices = docs.filter((d) => d.documentType === 'invoice');

  const match = computeMatch({ pos, grns, invoices });

  return {
    poNumber,
    ...match,
    documents: {
      po: pos.map((d) => d._id),
      grns: grns.map((d) => d._id),
      invoices: invoices.map((d) => d._id),
    },
  };
}

async function uploadDocument(req, res, next) {
  try {
    const documentType = String(req.body.documentType || '').toLowerCase().trim();
    if (!DOC_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: `documentType is required and must be one of: ${DOC_TYPES.join(', ')}`,
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required (multipart field name: "file").' });
    }

    const parsed = await parseDocument(req.file.buffer, req.file.mimetype, documentType);

    const doc = normalize(parsed, documentType, req.file);
    if (!doc.poNumber) {
      return res.status(422).json({
        error: 'Could not extract a poNumber from the document; cannot link it.',
        parsed,
      });
    }

    const saved = await Document.create(doc);

    const match = await buildMatchResult(saved.poNumber);

    return res.status(201).json({
      message: 'Document uploaded and parsed.',
      documentId: saved._id,
      documentType: saved.documentType,
      poNumber: saved.poNumber,
      match,
    });
  } catch (err) {
    return next(err);
  }
}

async function getDocument(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid document id.' });
    }
    const doc = await Document.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    return res.json(doc);
  } catch (err) {
    return next(err);
  }
}

async function getMatch(req, res, next) {
  try {
    const poNumber = String(req.params.poNumber).trim();
    const result = await buildMatchResult(poNumber);

    const total = result.documentCounts.po + result.documentCounts.grn + result.documentCounts.invoice;
    if (total === 0) {
      return res.status(404).json({ error: `No documents found for poNumber "${poNumber}".` });
    }
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadDocument, getDocument, getMatch };
