const express = require('express');
const { Expense, Job } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');
const { storeImage } = require('../utils/storage');

const router = express.Router();
router.use(authenticate);

const POP = [
  { path: 'user', select: 'name' },
  { path: 'job', select: 'title' },
  { path: 'site', select: 'name city' },
  { path: 'approvals.by', select: 'name' },
];

/** The approval chain, as an explicit transition table. */
const NEXT = {
  SUBMITTED: ['MANAGER_APPROVED', 'REJECTED'],
  MANAGER_APPROVED: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['REIMBURSED', 'REJECTED'],
};

router.get('/', requirePermission('expense', 'read'), wrap(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.scope === 'own') {
    filter.user = req.user._id;
  } else if (req.scope !== 'all') {
    const ids = await visibleUserIds(req);
    if (ids) filter.user = { $in: ids };
  }
  if (req.query.user) filter.user = req.query.user;
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.site) filter.site = req.query.site;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = req.query.from;
    if (req.query.to) filter.date.$lte = req.query.to;
  }
  const items = await Expense.find(filter).populate(POP).sort({ date: -1 }).limit(500).lean();
  res.json(items);
}));

/** Site-wise and category-wise totals — the whole reason both tags are mandatory. */
router.get('/summary', requirePermission('expense', 'read'), wrap(async (req, res) => {
  const match = { deletedAt: null, status: { $ne: 'REJECTED' } };
  if (req.scope === 'own') match.user = req.user._id;
  if (req.query.from) {
    match.date = { $gte: req.query.from };
    if (req.query.to) match.date.$lte = req.query.to;
  }
  const [bySite, byCategory, byStatus] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      { $group: { _id: '$site', total: { $sum: '$amount' }, n: { $sum: 1 } } },
      { $lookup: { from: 'sites', localField: '_id', foreignField: '_id', as: 's' } },
      { $project: { total: 1, n: 1, name: { $arrayElemAt: ['$s.name', 0] } } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: match },
      { $group: { _id: '$category', total: { $sum: '$amount' }, n: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: match },
      { $group: { _id: '$status', total: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
  ]);
  res.json({ bySite, byCategory, byStatus });
}));

router.post('/', requirePermission('expense', 'create'), wrap(async (req, res) => {
  const { receiptImage, ...body } = req.body;
  if (body.job && !body.site) {
    const job = await Job.findById(body.job).lean();
    if (job) body.site = job.site;
  }
  if (!body.site) throw httpError(400, 'Every expense must be tagged to a site');
  if (!body.category) throw httpError(400, 'Every expense must have a category');

  if (receiptImage) {
    const media = await storeImage(receiptImage, {
      kind: 'RECEIPT', userId: req.user._id, maxBytes: 1500 * 1024,
    });
    body.receipt = media._id;
  }
  const e = await Expense.create({ ...body, user: req.user._id });
  logActivity(req, {
    action: 'expense.create', entityType: 'expense', entityId: e._id,
    summary: `Submitted ${e.category.toLowerCase()} expense of ${e.amount}`,
  });
  res.status(201).json(await Expense.findById(e._id).populate(POP).lean());
}));

router.patch('/:id/status', requirePermission('expense', 'approve'), wrap(async (req, res) => {
  const { status, note } = req.body;
  const e = await Expense.findById(req.params.id);
  if (!e || e.deletedAt) return res.status(404).json({ error: 'Expense not found' });
  const allowed = NEXT[e.status] || [];
  if (!allowed.includes(status)) throw httpError(400, `An expense cannot move from ${e.status} to ${status}`);
  if (status === 'REJECTED' && !note) throw httpError(400, 'A reason is required to reject');

  const from = e.status;
  e.status = status;
  e.approvals.push({ by: req.user._id, action: status, note, at: new Date() });
  await e.save();
  logActivity(req, {
    action: 'expense.status', entityType: 'expense', entityId: e._id,
    summary: `Expense of ${e.amount} moved ${from} to ${status}${note ? ` — ${note}` : ''}`,
  });
  res.json(await Expense.findById(e._id).populate(POP).lean());
}));

router.delete('/:id', wrap(async (req, res) => {
  const e = await Expense.findById(req.params.id);
  if (!e || e.deletedAt) return res.status(404).json({ error: 'Expense not found' });
  if (String(e.user) !== String(req.user._id)) throw httpError(403, 'You can only withdraw your own expenses');
  if (!['SUBMITTED', 'DRAFT'].includes(e.status)) {
    throw httpError(400, 'This expense is already in the approval chain');
  }
  e.deletedAt = new Date();
  await e.save();
  logActivity(req, {
    action: 'expense.delete', entityType: 'expense', entityId: e._id,
    summary: `Withdrew expense of ${e.amount}`,
  });
  res.json({ ok: true });
}));

module.exports = router;
