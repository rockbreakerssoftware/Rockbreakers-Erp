const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Role, Job } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds } = require('../middleware/auth');
const { wrap, httpError, escapeRx } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

const PUBLIC = '-passwordHash';

/** Super Admin must always exist — this is the lock-out guard rail. */
async function assertNotLastSuperAdmin(user) {
  const superRole = await Role.findOne({ key: 'super_admin' }).lean();
  if (!superRole || String(user.role?._id || user.role) !== String(superRole._id)) return;
  const count = await User.countDocuments({ role: superRole._id, active: true, deletedAt: null });
  if (count <= 1) throw httpError(400, 'This is the last Super Admin — the account cannot be removed or demoted');
}

router.get('/', requirePermission('user', 'read'), wrap(async (req, res) => {
  const filter = { deletedAt: null };
  const ids = await visibleUserIds(req);
  if (ids) filter._id = { $in: ids };
  if (req.query.q) {
    const rx = new RegExp(escapeRx(req.query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { employeeCode: rx }];
  }
  if (req.query.department) filter.department = req.query.department;
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active) filter.active = req.query.active === 'true';

  const users = await User.find(filter).select(PUBLIC)
    .populate('role', 'name key').populate('department', 'name key')
    .populate('reportsTo', 'name').sort({ name: 1 }).lean();
  res.json(users);
}));

/** Engineers available to be put on a job. */
router.get('/assignable', wrap(async (req, res) => {
  const users = await User.find({ active: true, deletedAt: null })
    .select('name email skills department role').populate('role', 'name key')
    .sort({ name: 1 }).lean();
  res.json(users);
}));

router.get('/:id', requirePermission('user', 'read'), wrap(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, deletedAt: null }).select(PUBLIC)
    .populate('role').populate('department', 'name key').populate('reportsTo', 'name')
    .populate('sites', 'name city').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

router.post('/', requirePermission('user', 'create'), wrap(async (req, res) => {
  const { password, ...body } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  body.email = String(body.email || '').toLowerCase().trim();
  body.passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create(body);
  logActivity(req, {
    action: 'user.create', entityType: 'user', entityId: user._id,
    summary: `Created user ${user.name} (${user.email})`,
    after: { name: user.name, email: user.email, role: user.role },
  });
  res.status(201).json(await User.findById(user._id).select(PUBLIC).lean());
}));

router.put('/:id', requirePermission('user', 'update'), wrap(async (req, res) => {
  const before = await User.findById(req.params.id).populate('role');
  if (!before || before.deletedAt) return res.status(404).json({ error: 'User not found' });

  const { password, passwordHash, ...body } = req.body;
  if (body.role && String(body.role) !== String(before.role?._id)) await assertNotLastSuperAdmin(before);
  if (body.email) body.email = String(body.email).toLowerCase().trim();
  if (String(before._id) === String(req.user._id) && body.active === false) {
    throw httpError(400, 'You cannot deactivate your own account');
  }

  const user = await User.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
    .select(PUBLIC);
  logActivity(req, {
    action: 'user.update', entityType: 'user', entityId: user._id,
    summary: `Updated user ${user.name}`,
    before: { name: before.name, email: before.email, role: before.role?._id, active: before.active },
    after: { name: user.name, email: user.email, role: user.role, active: user.active },
  });
  res.json(user);
}));

router.patch('/:id/password', requirePermission('user', 'update'), wrap(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  logActivity(req, {
    action: 'user.password_reset', entityType: 'user', entityId: user._id,
    summary: `Reset password for ${user.name}`,
  });
  res.json({ ok: true });
}));

router.patch('/:id/active', requirePermission('user', 'update'), wrap(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role');
  if (!user) return res.status(404).json({ error: 'User not found' });
  const next = !!req.body.active;
  if (!next) {
    await assertNotLastSuperAdmin(user);
    if (String(user._id) === String(req.user._id)) throw httpError(400, 'You cannot deactivate your own account');
  }
  user.active = next;
  await user.save();
  logActivity(req, {
    action: next ? 'user.activate' : 'user.deactivate', entityType: 'user', entityId: user._id,
    summary: `${next ? 'Activated' : 'Deactivated'} ${user.name}`,
  });
  res.json({ ok: true, active: user.active });
}));

/**
 * Soft delete. A user with open jobs cannot be removed until that work is
 * reassigned — deleting them would orphan the job and break its audit trail.
 */
router.delete('/:id', requirePermission('user', 'delete'), wrap(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role');
  if (!user || user.deletedAt) return res.status(404).json({ error: 'User not found' });
  if (String(user._id) === String(req.user._id)) throw httpError(400, 'You cannot delete your own account');
  await assertNotLastSuperAdmin(user);

  const openJobs = await Job.countDocuments({
    'assignments.user': user._id,
    status: { $nin: ['CLOSED', 'CANCELLED'] },
    deletedAt: null,
  });
  if (openJobs > 0) {
    throw httpError(409, `${user.name} is still assigned to ${openJobs} open job${openJobs > 1 ? 's' : ''}. Reassign that work first.`);
  }

  user.deletedAt = new Date();
  user.active = false;
  user.email = `${user.email}.deleted.${Date.now()}`; // frees the address for reuse
  await user.save();
  logActivity(req, {
    action: 'user.delete', entityType: 'user', entityId: user._id,
    summary: `Deleted user ${user.name}`, before: { name: user.name, role: user.role?.name },
  });
  res.json({ ok: true });
}));

module.exports = router;
