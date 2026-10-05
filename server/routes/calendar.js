const express = require('express');
const { Job, Leave, Holiday, User, Attendance, SiteCheckIn } = require('../models');
const { authenticate, visibleUserIds, scopeFor } = require('../middleware/auth');
const { wrap } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

/**
 * The calendar is a derived view, never a stored table. It reads jobs, leave
 * and holidays directly, so a rescheduled job is correct everywhere at once
 * instead of drifting out of sync with a duplicate copy.
 */
router.get('/', wrap(async (req, res) => {
  const from = new Date(req.query.from || new Date());
  const to = new Date(req.query.to || new Date(Date.now() + 30 * 864e5));
  const view = req.query.view || 'my';

  const jobFilter = {
    deletedAt: null,
    status: { $ne: 'CANCELLED' },
    scheduledStart: { $lte: to },
    scheduledEnd: { $gte: from },
  };

  let people = null;
  if (view === 'my') {
    jobFilter['assignments.user'] = req.user._id;
    people = [req.user._id];
  } else if (view === 'site' && req.query.site) {
    jobFilter.site = req.query.site;
  } else {
    // team / department — bounded by what this user is allowed to read
    req.scope = scopeFor(req.user, 'job', 'read') || 'own';
    const ids = await visibleUserIds(req);
    if (ids) {
      jobFilter['assignments.user'] = { $in: ids };
      people = ids;
    }
  }

  const [jobs, holidays] = await Promise.all([
    Job.find(jobFilter)
      .populate('site', 'name city location')
      .populate('assignments.user', 'name')
      .select('title type status priority site scheduledStart scheduledEnd assignments')
      .sort({ scheduledStart: 1 }).limit(500).lean(),
    Holiday.find({
      date: { $gte: from.toISOString().slice(0, 10), $lte: to.toISOString().slice(0, 10) },
    }).lean(),
  ]);

  const leaveFilter = {
    status: 'APPROVED',
    from: { $lte: to.toISOString().slice(0, 10) },
    to: { $gte: from.toISOString().slice(0, 10) },
  };
  if (people) leaveFilter.user = { $in: people };
  const leaves = await Leave.find(leaveFilter).populate('user', 'name').lean();

  res.json({ jobs, leaves, holidays });
}));

/** One row per engineer, for the manager's resource-timeline view. */
router.get('/resources', wrap(async (req, res) => {
  req.scope = scopeFor(req.user, 'job', 'read') || 'own';
  const ids = await visibleUserIds(req);
  const filter = { active: true, deletedAt: null };
  if (ids) filter._id = { $in: ids };
  const users = await User.find(filter).select('name designation').populate('role', 'name')
    .sort({ name: 1 }).lean();
  res.json(users);
}));

/** Everything the engineer needs for today, in one request. */
router.get('/today', wrap(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 864e5 - 1);
  const z = (n) => String(n).padStart(2, '0');
  const dateKey = `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;

  const [jobs, attendance, checkIns] = await Promise.all([
    Job.find({
      'assignments.user': req.user._id,
      deletedAt: null,
      status: { $nin: ['CANCELLED', 'CLOSED'] },
      scheduledStart: { $lte: endOfDay },
      scheduledEnd: { $gte: startOfDay },
    }).populate('site', 'name city address location geofenceRadius')
      .populate('assignments.user', 'name').sort({ scheduledStart: 1 }).lean(),
    Attendance.findOne({ user: req.user._id, date: dateKey }).lean(),
    SiteCheckIn.find({ user: req.user._id, date: dateKey }).lean(),
  ]);

  res.json({ date: dateKey, jobs, attendance, checkIns });
}));

module.exports = router;
