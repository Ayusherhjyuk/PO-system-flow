const mongoose = require('mongoose');

const { Schema } = mongoose;

const itemSchema = new Schema(
  {
    sku: { type: String, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number, default: null },
    receivedQuantity: { type: Number, default: null },
  },
  { _id: false }
);

const documentSchema = new Schema(
  {
    documentType: {
      type: String,
      required: true,
      enum: ['po', 'grn', 'invoice'],
      index: true,
    },

    poNumber: { type: String, required: true, trim: true, index: true },

    grnNumber: { type: String, trim: true, default: null },
    invoiceNumber: { type: String, trim: true, default: null },

    poDate: { type: Date, default: null },
    grnDate: { type: Date, default: null },
    invoiceDate: { type: Date, default: null },

    vendorName: { type: String, trim: true, default: null },

    items: { type: [itemSchema], default: [] },

    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },

    rawParsed: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
