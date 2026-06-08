const ENFORCE_INVOICE_DATE_NOT_BEFORE_PO = true;

const REASONS = {
  GRN_QTY_EXCEEDS_PO_QTY: 'grn_qty_exceeds_po_qty',
  INVOICE_QTY_EXCEEDS_PO_QTY: 'invoice_qty_exceeds_po_qty',
  INVOICE_QTY_EXCEEDS_GRN_QTY: 'invoice_qty_exceeds_grn_qty',
  INVOICE_DATE_BEFORE_PO_DATE: 'invoice_date_before_po_date',
  DUPLICATE_PO: 'duplicate_po',
  ITEM_MISSING_IN_PO: 'item_missing_in_po',
};

const STATUS = {
  MATCHED: 'matched',
  PARTIALLY_MATCHED: 'partially_matched',
  MISMATCH: 'mismatch',
  INSUFFICIENT_DOCUMENTS: 'insufficient_documents',
};

function normalizeKey(sku) {
  return String(sku || '').trim().toLowerCase();
}

function num(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

function aggregateItems(documents, field) {
  const map = new Map();
  for (const doc of documents) {
    for (const item of doc.items || []) {
      const key = normalizeKey(item.sku);
      if (!key) continue;
      const prev = map.get(key) || { sku: item.sku, description: item.description, quantity: 0 };
      prev.quantity += num(item[field]);
      if (!prev.description && item.description) prev.description = item.description;
      map.set(key, prev);
    }
  }
  return map;
}

function computeMatch({ pos = [], grns = [], invoices = [] }) {
  const documentCounts = { po: pos.length, grn: grns.length, invoice: invoices.length };

  if (pos.length === 0 || grns.length === 0 || invoices.length === 0) {
    return {
      status: STATUS.INSUFFICIENT_DOCUMENTS,
      documentCounts,
      reasons: [],
      items: [],
      message: 'Need at least one PO, one GRN, and one Invoice to run a three-way match.',
    };
  }

  const globalReasons = [];
  if (pos.length > 1) globalReasons.push(REASONS.DUPLICATE_PO);

  const po = pos[0];
  const poItems = new Map();
  for (const item of po.items || []) {
    const key = normalizeKey(item.sku);
    if (!key) continue;
    poItems.set(key, { sku: item.sku, description: item.description, quantity: num(item.quantity) });
  }

  const grnAgg = aggregateItems(grns, 'receivedQuantity');
  const invAgg = aggregateItems(invoices, 'quantity');

  const poDate = po.poDate ? new Date(po.poDate) : null;
  const dateReasons = [];
  if (ENFORCE_INVOICE_DATE_NOT_BEFORE_PO && poDate) {
    for (const inv of invoices) {
      if (inv.invoiceDate && new Date(inv.invoiceDate) < poDate) {
        dateReasons.push(REASONS.INVOICE_DATE_BEFORE_PO_DATE);
        break;
      }
    }
  }

  const allKeys = new Set([...poItems.keys(), ...grnAgg.keys(), ...invAgg.keys()]);
  const items = [];

  for (const key of allKeys) {
    const poItem = poItems.get(key);
    const grnItem = grnAgg.get(key);
    const invItem = invAgg.get(key);

    const poQty = poItem ? poItem.quantity : null;
    const grnQty = grnItem ? grnItem.quantity : null;
    const invQty = invItem ? invItem.quantity : null;

    const reasons = [];

    if (!poItem) {
      reasons.push(REASONS.ITEM_MISSING_IN_PO);
    }
    if (poItem && grnItem && grnQty > poQty) {
      reasons.push(REASONS.GRN_QTY_EXCEEDS_PO_QTY);
    }
    if (poItem && invItem && invQty > poQty) {
      reasons.push(REASONS.INVOICE_QTY_EXCEEDS_PO_QTY);
    }
    if (grnItem && invItem && invQty > grnQty) {
      reasons.push(REASONS.INVOICE_QTY_EXCEEDS_GRN_QTY);
    }

    items.push({
      sku: (poItem || grnItem || invItem).sku,
      description: (poItem || grnItem || invItem).description || null,
      poQuantity: poQty,
      grnReceivedQuantity: grnQty,
      invoiceQuantity: invQty,
      matched: reasons.length === 0,
      reasons,
    });
  }

  const itemsWithIssues = items.filter((i) => !i.matched).length;
  const headerHasIssues = globalReasons.length > 0 || dateReasons.length > 0;

  let status;
  if (itemsWithIssues === 0 && !headerHasIssues) {
    status = STATUS.MATCHED;
  } else if (itemsWithIssues === items.length && items.length > 0) {
    status = STATUS.MISMATCH;
  } else {
    status = STATUS.PARTIALLY_MATCHED;
  }

  const reasonSet = new Set([...globalReasons, ...dateReasons]);
  for (const item of items) item.reasons.forEach((r) => reasonSet.add(r));

  return {
    status,
    documentCounts,
    reasons: [...reasonSet],
    items,
  };
}

module.exports = { computeMatch, REASONS, STATUS, normalizeKey };
