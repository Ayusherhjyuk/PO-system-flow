const express = require('express');
const { upload } = require('../middleware/upload');
const {
  uploadDocument,
  getDocument,
  getMatch,
} = require('../controllers/documentController');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.post('/documents/upload', upload.single('file'), uploadDocument);

router.get('/documents/:id', getDocument);

router.get('/match/:poNumber', getMatch);

module.exports = router;
