const express = require('express');
const { ActivityLog } = require('../models');
const { authenticate, requirePermission } = require('../middleware/auth');
const { wrap, escapeRx } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('log', 'read'), wrap(async (req, res) => {
  const filter = {};
  if (req.query.actor) filter.actor = req.query.actor;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  if (req.query.entityId) filter.entityId = String(req.query.entityId);
  if (req.query.action) filter.action = new RegExp('^' + escapeRx(req.query.action));
  if (req.query.q) filter.summary = new RegExp(escapeRx(req.query.q), 'i');
  if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = new Date(req.query.from);
    if (req.query.to) filter.at.$lte = new Date(req.query.to + 'T23:59:59');
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 60);
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

module.exports = router;
