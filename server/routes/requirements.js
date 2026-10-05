const express = require('express');
const { Requirement, Job } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

const POP = [
  { path: 'job', select: 'title type status' },
  { path: 'site', select: 'name city' },
  { path: 'raisedBy', select: 'name' },
  { path: 'approvals.by', select: 'name' },
];

router.get('/', requirePermission('requirement', 'read'), wrap(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.job) filter.job = req.query.job;
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.scope === 'own') {
    filter.raisedBy = req.user._id;
  } else if (req.scope === 'team') {
    const ids = await visibleUserIds(req);
    if (ids) filter.raisedBy = { $in: ids };
  }
  const items = await Requirement.find(filter).populate(POP).sort({ createdAt: -1 }).limit(300).lean();
  res.json(items);
}));

router.post('/', requirePermission('requirement', 'create'), wrap(async (req, res) => {
  const job = await Job.findById(req.body.job).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!req.body.items?.length) throw httpError(400, 'Add at least one item');
  const r = await Requirement.create({ ...req.body, site: job.site, raisedBy: req.user._id });
  logActivity(req, {
    action: 'requirement.create', entityType: 'requirement', entityId: r._id,
    summary: `Raised a ${(req.body.urgency || 'normal').toLowerCase()} requirement for ${req.body.items.length} item(s) on "${job.title}"`,
  });
  res.status(201).json(await Requirement.findById(r._id).populate(POP).lean());
}));

router.patch('/:id/status', requirePermission('requirement', 'approve'), wrap(async (req, res) => {
  const { status, note } = req.body;
  const r = await Requirement.findById(req.params.id);
  if (!r || r.deletedAt) return res.status(404).json({ error: 'Requirement not found' });
  if (status === 'REJECTED' && !note) throw httpError(400, 'A reason is required to reject');
  r.status = status;
  if (req.body.expectedDate) r.expectedDate = req.body.expectedDate;
  r.approvals.push({ by: req.user._id, action: status, note, at: new Date() });
  await r.save();
  logActivity(req, {
    action: 'requirement.status', entityType: 'requirement', entityId: r._id,
    summary: `Requirement moved to ${status}${note ? ` — ${note}` : ''}`,
  });
  res.json(await Requirement.findById(r._id).populate(POP).lean());
}));

module.exports = router;
