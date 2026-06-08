require('dotenv').config();
const path = require('path');
const { connectDB } = require('../src/config/db');
const Document = require('../src/models/Document');
const { computeMatch } = require('../src/services/matchEngine');

const PO_NUMBER = 'CI4PO05788';

function loadParsed(type) {
  return require(path.join(__dirname, '..', 'examples', `sample-parsed-${type}.json`));
}

function toDoc(type) {
  const p = loadParsed(type);
  return {
    documentType: type,
    poNumber: p.poNumber,
    grnNumber: p.grnNumber,
    invoiceNumber: p.invoiceNumber,
    poDate: p.poDate ? new Date(p.poDate) : null,
    grnDate: p.grnDate ? new Date(p.grnDate) : null,
    invoiceDate: p.invoiceDate ? new Date(p.invoiceDate) : null,
    vendorName: p.vendorName,
    items: p.items,
    fileName: `${type}-seed.json`,
    rawParsed: p,
  };
}

async function main() {
  await connectDB(process.env.MONGODB_URI);

  if (process.argv.includes('--reset')) {
    const { deletedCount } = await Document.deleteMany({ poNumber: PO_NUMBER });
    console.log(`[seed] Removed ${deletedCount} existing documents for ${PO_NUMBER}`);
  }

  for (const type of ['po', 'grn', 'invoice']) {
    await Document.create(toDoc(type));
    console.log(`[seed] Inserted ${type.toUpperCase()} for ${PO_NUMBER}`);
  }

  const docs = await Document.find({ poNumber: PO_NUMBER }).lean();
  const match = computeMatch({
    pos: docs.filter((d) => d.documentType === 'po'),
    grns: docs.filter((d) => d.documentType === 'grn'),
    invoices: docs.filter((d) => d.documentType === 'invoice'),
  });

  console.log('\n[seed] Match result:');
  console.log(JSON.stringify({ poNumber: PO_NUMBER, ...match }, null, 2));

  await require('mongoose').connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});
