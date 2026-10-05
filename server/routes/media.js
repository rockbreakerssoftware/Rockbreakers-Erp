const express = require('express');
const { Media } = require('../models');
const { authenticate } = require('../middleware/auth');
const { resolveMedia } = require('../utils/storage');
const { wrap } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

router.get('/:id', wrap(async (req, res) => {
  const media = await Media.findById(req.params.id).select('+data');
  if (!media) return res.status(404).json({ error: 'Image not found' });

  const resolved = resolveMedia(media);
  if (!resolved) return res.status(404).json({ error: 'Image not found' });

  // Cloudinary-backed: hand out a short-lived signed URL. The caller has
  // already passed our auth, and the redirect keeps image bandwidth off this
  // server while the photo itself stays unreachable without a signature.
  if (resolved.redirect) {
    res.set('Cache-Control', 'private, max-age=540'); // just under the signature's life
    return res.redirect(302, resolved.redirect);
  }

  res.set('Content-Type', resolved.contentType);
  res.set('Content-Length', String(resolved.buffer.length));
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.end(resolved.buffer); // end, not send — send appends a charset to the image type
}));

module.exports = router;
