const express = require('express');
const { Leave } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds } = require('../middleware/auth');
const { wrap } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

router.get('/', wrap(async (req, res) => {
  const filter = {};
  if (req.query.mine === 'true') filter.user = req.user._id;
  if (req.query.from && req.query.to) {
    filter.from = { $lte: req.query.to };
    filter.to = { $gte: req.query.from };
  }
  const leaves = await Leave.find(filter).populate('user', 'name').sort({ from: -1 }).limit(300).lean();
  res.json(leaves);
}));

router.post('/', wrap(async (req, res) => {
  const leave = await Leave.create({ ...req.body, user: req.body.user || req.user._id });
  logActivity(req, { action: 'leave.create', entityType: 'leave', entityId: leave._id,
    summary: `Applied for ${leave.type.toLowerCase()} leave ${leave.from} to ${leave.to}` });
  res.status(201).json(leave);
}));

router.patch('/:id/status', requirePermission('leave', 'approve'), wrap(async (req, res) => {
  const leave = await Leave.findByIdAndUpdate(req.params.id,
    { status: req.body.status, actionedBy: req.user._id }, { new: true }).populate('user', 'name');
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  logActivity(req, { action: 'leave.status', entityType: 'leave', entityId: leave._id,
    summary: `${leave.status} leave for ${leave.user?.name}` });
  res.json(leave);
}));

module.exports = router;
