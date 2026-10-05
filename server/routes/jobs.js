const express = require('express');
const { Job, User, Site, Leave, JOB_STATUS } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds } = require('../middleware/auth');
const { wrap, httpError, escapeRx } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

/** Legal status moves. Illegal transitions are rejected here, not in the UI. */
const TRANSITIONS = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'ON_HOLD', 'SCHEDULED', 'CANCELLED'],
  IN_PROGRESS: ['WORK_DONE', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED'],
  WORK_DONE: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

const POP = [
  { path: 'site', select: 'name city address location geofenceRadius' },
  { path: 'customer', select: 'name' },
  { path: 'assignments.user', select: 'name email phone designation' },
  { path: 'createdBy', select: 'name' },
];

async function jobFilterForScope(req) {
  if (req.scope === 'all') return {};
  if (req.scope === 'department' && req.user.department) {
    return { $or: [{ department: req.user.department._id }, { 'assignments.user': req.user._id }] };
  }
  if (req.scope === 'team') {
    const ids = await visibleUserIds(req);
    return { 'assignments.user': { $in: ids } };
  }
  return { 'assignments.user': req.user._id };
}

router.get('/', requirePermission('job', 'read'), wrap(async (req, res) => {
  const filter = { deletedAt: null, ...(await jobFilterForScope(req)) };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.site) filter.site = req.query.site;
  if (req.query.engineer) filter['assignments.user'] = req.query.engineer;
  if (req.query.from || req.query.to) {
    filter.scheduledStart = {};
    if (req.query.to) filter.scheduledStart.$lte = new Date(req.query.to);
    if (req.query.from) filter.scheduledEnd = { $gte: new Date(req.query.from) };
    if (!req.query.to) delete filter.scheduledStart;
  }
  if (req.query.q) filter.title = new RegExp(escapeRx(req.query.q), 'i');

  const jobs = await Job.find(filter).populate(POP).sort({ scheduledStart: -1 }).limit(500).lean();
  res.json(jobs);
}));

router.get('/:id', requirePermission('job', 'read'), wrap(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, deletedAt: null }).populate(POP).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}));

router.post('/', requirePermission('job', 'create'), wrap(async (req, res) => {
  const body = { ...req.body, createdBy: req.user._id };
  if (!body.department && req.user.department) body.department = req.user.department._id;
  if (new Date(body.scheduledEnd) < new Date(body.scheduledStart)) {
    throw httpError(400, 'The end date cannot be before the start date');
  }
  if (body.site && !body.customer) {
    const site = await Site.findById(body.site).lean();
    if (site?.customer) body.customer = site.customer;
  }
  normaliseLead(body.assignments);
  const job = await Job.create(body);
  logActivity(req, {
    action: 'job.create', entityType: 'job', entityId: job._id,
    summary: `Scheduled ${job.type} "${job.title}"`,
    after: { title: job.title, type: job.type, start: job.scheduledStart, crew: job.assignments.length },
  });
  res.status(201).json(await Job.findById(job._id).populate(POP).lean());
}));

router.put('/:id', requirePermission('job', 'update'), wrap(async (req, res) => {
  const before = await Job.findById(req.params.id).lean();
  if (!before || before.deletedAt) return res.status(404).json({ error: 'Job not found' });
  if (['CLOSED', 'CANCELLED'].includes(before.status)) {
    throw httpError(400, `A ${before.status.toLowerCase()} job cannot be edited`);
  }
  const body = { ...req.body };
  delete body._id; delete body.status;
  normaliseLead(body.assignments);

  const job = await Job.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).populate(POP);
  const rescheduled = String(before.scheduledStart) !== String(job.scheduledStart);
  logActivity(req, {
    action: rescheduled ? 'job.reschedule' : 'job.update', entityType: 'job', entityId: job._id,
    summary: rescheduled
      ? `Rescheduled "${job.title}" to ${new Date(job.scheduledStart).toDateString()}`
      : `Updated job "${job.title}"`,
    before: { start: before.scheduledStart, end: before.scheduledEnd, title: before.title },
    after: { start: job.scheduledStart, end: job.scheduledEnd, title: job.title },
  });
  res.json(job);
}));

router.patch('/:id/status', requirePermission('job', 'update'), wrap(async (req, res) => {
  const { status, note } = req.body;
  if (!JOB_STATUS.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const job = await Job.findById(req.params.id);
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });

  if (!TRANSITIONS[job.status].includes(status)) {
    throw httpError(400, `A job cannot move from ${job.status} to ${status}`);
  }
  if (status === 'ON_HOLD' && !note) throw httpError(400, 'A reason is required to put a job on hold');

  const from = job.status;
  job.status = status;
  if (status === 'ON_HOLD') job.holdReason = note;
  if (status === 'CLOSED') {
    job.closedAt = new Date();
    job.closedBy = req.user._id;
    job.completionNotes = note || job.completionNotes;
  }
  await job.save();
  logActivity(req, {
    action: 'job.status', entityType: 'job', entityId: job._id,
    summary: `"${job.title}" moved ${from} → ${status}${note ? ` (${note})` : ''}`,
    before: { status: from }, after: { status },
  });
  res.json(await Job.findById(job._id).populate(POP).lean());
}));

/** Add or update one crew member. */
router.post('/:id/assign', requirePermission('job', 'assign'), wrap(async (req, res) => {
  const { user, roleOnJob = 'MEMBER' } = req.body;
  const job = await Job.findById(req.params.id);
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });
  const person = await User.findById(user).lean();
  if (!person) return res.status(400).json({ error: 'That user does not exist' });

  const existing = job.assignments.find((a) => String(a.user) === String(user));
  if (existing) {
    existing.roleOnJob = roleOnJob;
  } else {
    job.assignments.push({ user, roleOnJob, status: 'ASSIGNED' });
  }
  if (roleOnJob === 'LEAD') {
    job.assignments.forEach((a) => {
      if (String(a.user) !== String(user) && a.roleOnJob === 'LEAD') a.roleOnJob = 'MEMBER';
    });
  }
  await job.save();
  logActivity(req, {
    action: 'job.assign', entityType: 'job', entityId: job._id,
    summary: `Assigned ${person.name} to "${job.title}" as ${roleOnJob}`,
  });
  res.json(await Job.findById(job._id).populate(POP).lean());
}));

router.delete('/:id/assign/:userId', requirePermission('job', 'assign'), wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });
  const person = await User.findById(req.params.userId).lean();
  job.assignments = job.assignments.filter((a) => String(a.user) !== String(req.params.userId));
  await job.save();
  logActivity(req, {
    action: 'job.unassign', entityType: 'job', entityId: job._id,
    summary: `Removed ${person?.name || 'a user'} from "${job.title}"${req.body?.reason ? ` — ${req.body.reason}` : ''}`,
  });
  res.json(await Job.findById(job._id).populate(POP).lean());
}));

/**
 * Assignment safety checks. These are warnings, not blocks — a manager may
 * have a good reason to double-book, but they should see it first.
 */
router.get('/:id/conflicts', requirePermission('job', 'read'), wrap(async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const ids = job.assignments.map((a) => a.user);
  if (!ids.length) return res.json([]);

  const overlapping = await Job.find({
    _id: { $ne: job._id },
    deletedAt: null,
    status: { $nin: ['CANCELLED', 'CLOSED'] },
    'assignments.user': { $in: ids },
    scheduledStart: { $lte: job.scheduledEnd },
    scheduledEnd: { $gte: job.scheduledStart },
  }).populate('assignments.user', 'name').select('title scheduledStart scheduledEnd assignments').lean();

  const startKey = new Date(job.scheduledStart).toISOString().slice(0, 10);
  const endKey = new Date(job.scheduledEnd).toISOString().slice(0, 10);
  const leaves = await Leave.find({
    user: { $in: ids }, status: 'APPROVED', from: { $lte: endKey }, to: { $gte: startKey },
  }).populate('user', 'name').lean();

  const warnings = [];
  for (const other of overlapping) {
    for (const a of other.assignments) {
      if (!ids.some((i) => String(i) === String(a.user?._id || a.user))) continue;
      warnings.push({
        type: 'DOUBLE_BOOKED',
        user: a.user?._id || a.user,
        userName: a.user?.name,
        message: `Also on "${other.title}" during this window`,
      });
    }
  }
  for (const l of leaves) {
    warnings.push({
      type: 'ON_LEAVE', user: l.user?._id, userName: l.user?.name,
      message: `On approved ${l.type.toLowerCase()} leave ${l.from} to ${l.to}`,
    });
  }
  res.json(warnings);
}));

/** Engineer accepts, or asks for a different date. */
router.post('/:id/respond', wrap(async (req, res) => {
  const { action, note } = req.body;
  const job = await Job.findById(req.params.id);
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });
  const mine = job.assignments.find((a) => String(a.user) === String(req.user._id));
  if (!mine) return res.status(403).json({ error: 'You are not assigned to this job' });

  if (action === 'accept') {
    mine.status = 'ACCEPTED';
    mine.acceptedAt = new Date();
    if (job.status === 'SCHEDULED') job.status = 'ACCEPTED';
  } else {
    mine.status = 'DECLINED';
    mine.note = note;
  }
  await job.save();
  logActivity(req, {
    action: `job.${action}`, entityType: 'job', entityId: job._id,
    summary: `${req.user.name} ${action === 'accept' ? 'accepted' : 'requested a reschedule for'} "${job.title}"${note ? ` — ${note}` : ''}`,
  });
  res.json(await Job.findById(job._id).populate(POP).lean());
}));

router.delete('/:id', requirePermission('job', 'delete'), wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });
  job.deletedAt = new Date();
  await job.save();
  logActivity(req, {
    action: 'job.delete', entityType: 'job', entityId: job._id, summary: `Deleted job "${job.title}"`,
  });
  res.json({ ok: true });
}));

/** Exactly one LEAD per job, enforced server-side. */
function normaliseLead(assignments) {
  if (!Array.isArray(assignments) || !assignments.length) return;
  const leads = assignments.filter((a) => a.roleOnJob === 'LEAD');
  if (leads.length === 0) assignments[0].roleOnJob = 'LEAD';
  else if (leads.length > 1) leads.slice(1).forEach((a) => { a.roleOnJob = 'MEMBER'; });
}

module.exports = router;
