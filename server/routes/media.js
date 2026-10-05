const express = require('express');
const { Media } = require('../models');
const { authenticate } = require('../middleware/auth');
const { wrap } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

router.get('/:id', wrap(async (req, res) => {
  const media = await Media.findById(req.params.id).select('+data');
  if (!media?.data) return res.status(404).json({ error: 'Image not found' });

  // Not .lean(): a lean read hands back a BSON Binary rather than a Buffer, and
  // Express would then JSON-serialise it instead of sending the image bytes.
  const buf = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data.buffer || media.data);

  res.set('Content-Type', media.contentType);
  res.set('Content-Length', String(buf.length));
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.end(buf); // end, not send — send appends a charset to the image content type
}));

module.exports = router;
