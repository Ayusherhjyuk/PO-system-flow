# Three-Way Match Engine (PO · GRN · Invoice)

A backend service that ingests **Purchase Order**, **Goods Receipt Note**, and **Invoice** documents, extracts structured data with the **Gemini API**, stores it in **MongoDB**, and performs an item-level three-way match. Documents can arrive in any order.

**Stack:** Node.js · Express · MongoDB (Mongoose) · Google Gemini.

**Live backend:** https://three-way-match-engine-zbdy.onrender.com (health check: [`/health`](https://three-way-match-engine-zbdy.onrender.com/health))

## Screenshots

| Upload | Match result | Mismatch |
|---|---|---|
| [![Upload](https://drive.google.com/thumbnail?id=15qWqOE0RiNjRuP8MuDjVEj_-d5-xzqlN&sz=w600)](https://drive.google.com/file/d/15qWqOE0RiNjRuP8MuDjVEj_-d5-xzqlN/view?usp=sharing) | [![Match](https://drive.google.com/thumbnail?id=1mhsF2n90d3XRAZAoc6MDR0TYqti0xpJ5&sz=w600)](https://drive.google.com/file/d/1mhsF2n90d3XRAZAoc6MDR0TYqti0xpJ5/view?usp=sharing) | [![Mismatch](https://drive.google.com/thumbnail?id=1zgmkxS6T_d-_htURVT5B29nfxRC3By2W&sz=w600)](https://drive.google.com/file/d/1zgmkxS6T_d-_htURVT5B29nfxRC3By2W/view?usp=sharing) |

## Quick start

**Prerequisites:** Node.js 18+, a MongoDB instance, and a [Gemini API key](https://aistudio.google.com/app/apikey).

```bash
npm install
cp .env.example .env       # set MONGODB_URI and GEMINI_API_KEY
npm start                  # or: npm run dev  (auto-restart)
```

Server runs on `http://localhost:3000`.

To try storage + matching without uploading PDFs, seed the DB from the sample JSON:

```bash
npm run seed -- --reset
```

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/documents/upload` | Upload a file + `documentType` → parse → store → match |
| `GET`  | `/documents/:id` | Fetch one stored document |
| `GET`  | `/match/:poNumber` | Three-way match result for a PO |
| `GET`  | `/health` | Liveness check |

```bash
curl -F "documentType=po" -F "file=@PO.pdf" http://localhost:3000/documents/upload
curl http://localhost:3000/match/CI4PO05788
```

See [`openapi.yaml`](./openapi.yaml), [`postman_collection.json`](./postman_collection.json), and sample outputs in [`examples/`](./examples).

## How it works

- **Each document is parsed and stored independently**, tagged with its type and linked by `poNumber`.
- **Matching is a pure function recomputed on demand** from whatever documents currently exist for a `poNumber`. There's no stored match state, so out-of-order uploads (Invoice → GRN → PO) produce the same result as any other order.
- If not all three types are present yet, the status is `insufficient_documents` and upgrades automatically as documents arrive.

Items are matched on **`sku`** (normalized to trim + lowercase) — a stable identifier present on the PO and GRN, unlike free-text descriptions which drift between documents. GRNs and Invoices are summed per item, supporting partial receipts and split billing.

### Match rules

| Rule | Reason code |
|---|---|
| GRN qty must not exceed PO qty | `grn_qty_exceeds_po_qty` |
| Invoice qty must not exceed total GRN qty | `invoice_qty_exceeds_grn_qty` |
| Invoice qty must not exceed PO qty | `invoice_qty_exceeds_po_qty` |
| Invoice date must not be before PO date | `invoice_date_before_po_date` |
| Item billed/received but not on PO | `item_missing_in_po` |
| More than one PO for a poNumber | `duplicate_po` |

**Status:** `matched` (all items pass), `mismatch` (every item fails), `partially_matched` (mixed, or header-only issues like the date rule), or `insufficient_documents`.

> **Note on the date rule:** the spec says the invoice date must not be *after* the PO date, but I think that's backwards. An invoice is the bill that comes after the order, so it should normally be dated on or after the PO — and the sample data backs this up (PO is `2026-03-17`, invoice is `2026-03-24`). So I assumed the real-world rule and flag an invoice only when it's dated *before* its PO.

## Project structure

```
src/
  server.js, app.js              # boot + express app
  config/db.js                   # mongoose connection
  models/Document.js             # single document schema (all three types)
  middleware/upload.js           # multer (in-memory)
  services/
    geminiParser.js              # Gemini extraction (type-specific prompts, retry)
    matchEngine.js               # pure three-way match function
  controllers/documentController.js
  routes/index.js
scripts/seed.js                  # load samples + print match
examples/                        # sample parsed JSON + match results
```
