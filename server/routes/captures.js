const express = require('express');
const { Capture, Job } = require('../models');
const { authenticate, requirePermission, logActivity } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');
const { storeImage } = require('../utils/storage');

const router = express.Router();
router.use(authenticate);

router.get('/', wrap(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.job) filter.job = req.query.job;
  if (req.query.site) filter.site = req.query.site;
  if (req.query.phase) filter.phase = req.query.phase;
  if (!req.query.job && !req.query.site) filter.user = req.user._id;
  const items = await Capture.find(filter)
    .populate('user', 'name').populate('site', 'name')
    .sort({ createdAt: -1 }).limit(300).lean();
  res.json(items);
}));

router.post('/', requirePermission('capture', 'create'), wrap(async (req, res) => {
  const { job: jobId, image, phase, tags, note, lat, lng } = req.body;
  const job = await Job.findById(jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!image) throw httpError(400, 'A photo is required');
  const media = await storeImage(image, {
    kind: 'CAPTURE', userId: req.user._id, maxBytes: 1200 * 1024,
  });
  const capture = await Capture.create({
    job: jobId, site: job.site, user: req.user._id, media: media._id,
    phase: phase || 'DURING', tags: tags || [], note, lat, lng, at: new Date(),
  });
  logActivity(req, {
    action: 'capture.create', entityType: 'job', entityId: jobId,
    summary: `Added a ${(phase || 'during').toLowerCase()} photo to "${job.title}"`,
  });
  res.status(201).json(await Capture.findById(capture._id).populate('user', 'name').lean());
}));

/** Evidence is append-only: removal is a soft delete and always needs a reason. */
router.delete('/:id', requirePermission('capture', 'delete'), wrap(async (req, res) => {
  const { reason } = req.body;
  if (!reason) throw httpError(400, 'A reason is required to remove site evidence');
  const capture = await Capture.findById(req.params.id);
  if (!capture || capture.deletedAt) return res.status(404).json({ error: 'Capture not found' });
  capture.deletedAt = new Date();
  capture.deleteReason = reason;
  await capture.save();
  logActivity(req, {
    action: 'capture.delete', entityType: 'capture', entityId: capture._id,
    summary: `Removed a site photo — ${reason}`,
  });
  res.json({ ok: true });
}));

module.exports = router;
