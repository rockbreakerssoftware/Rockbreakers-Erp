const express = require('express');
const { Job, SiteCheckIn, Attendance, Expense, Requirement, User, Site } = require('../models');
const { authenticate, can, scopeFor, visibleUserIds } = require('../middleware/auth');
const { wrap } = require('../utils/crud');
const { todayKey } = require('../utils/geo');

const router = express.Router();
router.use(authenticate);

/**
 * One role-aware payload. Each role gets the numbers it can act on, rather
 * than a generic set of counters nobody owns.
 */
router.get('/', wrap(async (req, res) => {
  const me = req.user;
  const today = todayKey();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 864e5 - 1);
  const weekAhead = new Date(startOfDay.getTime() + 7 * 864e5);

  req.scope = scopeFor(me, 'job', 'read') || 'own';
  const teamIds = await visibleUserIds(req);
  const wide = req.scope === 'all' || req.scope === 'department';

  const out = { role: me.role?.name, scope: req.scope, today, cards: [], sections: {} };

  /* --- mine: every role sees their own day first --------------------- */
  const [myToday, myAttendance, myOpenJobs] = await Promise.all([
    Job.find({
      'assignments.user': me._id, deletedAt: null,
      status: { $nin: ['CANCELLED', 'CLOSED'] },
      scheduledStart: { $lte: endOfDay }, scheduledEnd: { $gte: startOfDay },
    }).populate('site', 'name city').sort({ scheduledStart: 1 }).lean(),
    Attendance.findOne({ user: me._id, date: today }).lean(),
    Job.countDocuments({
      'assignments.user': me._id, deletedAt: null,
      status: { $nin: ['CANCELLED', 'CLOSED'] },
    }),
  ]);

  const myCheckIns = await SiteCheckIn.find({ user: me._id, date: today }).lean();
  out.sections.myDay = {
    jobs: myToday,
    attendance: myAttendance,
    checkIns: myCheckIns,
    pendingAccept: myToday.filter((j) =>
      j.assignments.some((a) => String(a.user) === String(me._id) && a.status === 'ASSIGNED')).length,
  };
  out.cards.push(
    { key: 'my_today', label: "Today's jobs", value: myToday.length, hint: myToday.length ? myToday[0].site?.name : 'Nothing scheduled' },
    { key: 'my_open', label: 'My open jobs', value: myOpenJobs },
    { key: 'attendance', label: 'Attendance', value: myAttendance?.checkOut?.at ? 'Done' : myAttendance?.checkIn?.at ? 'Marked in' : 'Not marked', tone: myAttendance?.checkIn?.at ? 'ok' : 'warn' },
  );

  /* --- manager / admin view ------------------------------------------ */
  if (wide || req.scope === 'team') {
    const teamFilter = teamIds ? { 'assignments.user': { $in: teamIds } } : {};

    const [todayJobs, overdue, onHold, flagged, unmarked, weekJobs] = await Promise.all([
      Job.find({
        ...teamFilter, deletedAt: null, status: { $nin: ['CANCELLED', 'CLOSED'] },
        scheduledStart: { $lte: endOfDay }, scheduledEnd: { $gte: startOfDay },
      }).populate('site', 'name city').populate('assignments.user', 'name').sort({ scheduledStart: 1 }).lean(),
      Job.countDocuments({
        ...teamFilter, deletedAt: null,
        status: { $in: ['SCHEDULED', 'ACCEPTED', 'IN_PROGRESS'] },
        scheduledEnd: { $lt: startOfDay },
      }),
      Job.countDocuments({ ...teamFilter, deletedAt: null, status: 'ON_HOLD' }),
      SiteCheckIn.find({
        outOfGeofence: true, reviewStatus: 'PENDING',
        ...(teamIds ? { user: { $in: teamIds } } : {}),
      })
        .populate('user', 'name').populate('site', 'name').populate('job', 'title')
        .sort({ createdAt: -1 }).limit(10).lean(),
      (async () => {
        const ids = teamIds || (await User.find({ active: true, deletedAt: null }).select('_id').lean()).map((u) => u._id);
        const marked = await Attendance.find({ user: { $in: ids }, date: today }).select('user').lean();
        const markedSet = new Set(marked.map((a) => String(a.user)));
        return ids.filter((i) => !markedSet.has(String(i))).length;
      })(),
      Job.countDocuments({
        ...teamFilter, deletedAt: null, status: { $nin: ['CANCELLED', 'CLOSED'] },
        scheduledStart: { $gte: startOfDay, $lte: weekAhead },
      }),
    ]);

    out.sections.team = { todayJobs, flagged };
    out.cards.push(
      { key: 'team_today', label: 'Team jobs today', value: todayJobs.length },
      { key: 'week', label: 'Next 7 days', value: weekJobs },
      { key: 'overdue', label: 'Overdue jobs', value: overdue, tone: overdue ? 'bad' : 'ok' },
      { key: 'on_hold', label: 'On hold', value: onHold, tone: onHold ? 'warn' : 'ok' },
      { key: 'flagged', label: 'Flagged check-ins', value: flagged.length, tone: flagged.length ? 'warn' : 'ok' },
      { key: 'unmarked', label: 'Attendance not marked', value: unmarked, tone: unmarked ? 'warn' : 'ok' },
    );
  }

  /* --- approvals waiting on this user --------------------------------- */
  if (can(me, 'expense', 'approve')) {
    const [pendingExp, pendingAmount] = await Promise.all([
      Expense.countDocuments({ deletedAt: null, status: { $in: ['SUBMITTED', 'MANAGER_APPROVED', 'VERIFIED'] } }),
      Expense.aggregate([
        { $match: { deletedAt: null, status: { $in: ['SUBMITTED', 'MANAGER_APPROVED', 'VERIFIED'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const total = pendingAmount[0]?.total || 0;
    out.cards.push({
      key: 'expenses', label: 'Expenses awaiting action', value: pendingExp,
      hint: total ? `₹${total.toLocaleString('en-IN')} in the chain` : null,
      tone: pendingExp ? 'warn' : 'ok',
    });
    out.sections.pendingExpenseTotal = total;
  }

  if (can(me, 'requirement', 'approve')) {
    const pendingReq = await Requirement.countDocuments({ deletedAt: null, status: 'SUBMITTED' });
    out.cards.push({ key: 'requirements', label: 'Requirements to approve', value: pendingReq, tone: pendingReq ? 'warn' : 'ok' });
  }

  if (can(me, 'user', 'read') && wide) {
    const [people, sites] = await Promise.all([
      User.countDocuments({ active: true, deletedAt: null }),
      Site.countDocuments({ deletedAt: null }),
    ]);
    out.cards.push(
      { key: 'people', label: 'Active employees', value: people },
      { key: 'sites', label: 'Sites', value: sites },
    );
  }

  /* --- my pending expenses (everyone) --------------------------------- */
  const myPending = await Expense.countDocuments({
    user: me._id, deletedAt: null, status: { $in: ['SUBMITTED', 'MANAGER_APPROVED', 'VERIFIED'] },
  });
  if (myPending) out.cards.push({ key: 'my_expenses', label: 'My expenses in process', value: myPending });

  res.json(out);
}));

module.exports = router;
