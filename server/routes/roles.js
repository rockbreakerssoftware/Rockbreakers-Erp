const express = require('express');
const { Role, User } = require('../models');
const { authenticate, requirePermission, logActivity } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

/** The permission matrix the role editor renders. */
const RESOURCES = [
  { key: 'user', label: 'Users', actions: ['create', 'read', 'update', 'delete'] },
  { key: 'role', label: 'Roles & permissions', actions: ['create', 'read', 'update', 'delete'] },
  { key: 'department', label: 'Departments', actions: ['create', 'read', 'update', 'delete'] },
  { key: 'customer', label: 'Customers', actions: ['create', 'read', 'update', 'delete'] },
  { key: 'site', label: 'Sites', actions: ['create', 'read', 'update', 'delete'] },
  { key: 'job', label: 'Jobs & scheduling', actions: ['create', 'read', 'update', 'delete', 'assign', 'close'] },
  { key: 'attendance', label: 'Attendance', actions: ['create', 'read', 'update', 'approve'] },
  { key: 'capture', label: 'Site captures', actions: ['create', 'read', 'delete'] },
  { key: 'requirement', label: 'Requirements', actions: ['create', 'read', 'update', 'approve'] },
  { key: 'expense', label: 'Expenses', actions: ['create', 'read', 'update', 'approve', 'reimburse'] },
  { key: 'leave', label: 'Leave', actions: ['create', 'read', 'approve'] },
  { key: 'payroll', label: 'Salary & attendance', actions: ['read'] },
  { key: 'report', label: 'Reports & dashboard', actions: ['read'] },
  { key: 'log', label: 'Activity log', actions: ['read'] },
];

const SCOPES = [
  { key: 'own', label: 'Own' },
  { key: 'team', label: 'Team' },
  { key: 'department', label: 'Department' },
  { key: 'all', label: 'Everyone' },
];

router.get('/meta', (req, res) => res.json({ resources: RESOURCES, scopes: SCOPES }));

router.get('/', requirePermission('role', 'read'), wrap(async (req, res) => {
  const roles = await Role.find({ deletedAt: null }).sort({ name: 1 }).lean();
  const counts = await User.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$role', n: { $sum: 1 } } },
  ]);
  const byRole = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json(roles.map((r) => ({ ...r, userCount: byRole[String(r._id)] || 0 })));
}));

router.get('/:id', requirePermission('role', 'read'), wrap(async (req, res) => {
  const role = await Role.findOne({ _id: req.params.id, deletedAt: null }).lean();
  if (!role) return res.status(404).json({ error: 'Role not found' });
  const userCount = await User.countDocuments({ role: role._id, deletedAt: null });
  res.json({ ...role, userCount });
}));

router.post('/', requirePermission('role', 'create'), wrap(async (req, res) => {
  const { name, description, permissions = [], cloneFrom } = req.body;
  if (!name) return res.status(400).json({ error: 'Role name is required' });
  let perms = permissions;
  if (cloneFrom) {
    const src = await Role.findById(cloneFrom).lean();
    if (src) perms = src.permissions;
  }
  const key = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const role = await Role.create({ name, key, description, permissions: perms });
  logActivity(req, {
    action: 'role.create', entityType: 'role', entityId: role._id,
    summary: `Created role "${role.name}" with ${perms.length} permissions`, after: { permissions: perms },
  });
  res.status(201).json(role);
}));

router.put('/:id', requirePermission('role', 'update'), wrap(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role || role.deletedAt) return res.status(404).json({ error: 'Role not found' });

  const before = { name: role.name, permissions: [...role.permissions] };
  const nextPerms = req.body.permissions ?? role.permissions;

  // An admin must not be able to strip their own ability to manage roles —
  // that is the other way a system locks everyone out.
  if (String(req.user.role._id) === String(role._id)) {
    const keeps = (p) => nextPerms.includes(p) || nextPerms.includes('*');
    if (!keeps('role:update:all') && !nextPerms.some((p) => p.startsWith('role:update'))) {
      throw httpError(400, 'You cannot remove role-management permission from your own role');
    }
  }
  if (role.isSystem && req.body.name && req.body.name !== role.name) {
    throw httpError(400, 'A built-in role cannot be renamed');
  }

  role.name = req.body.name ?? role.name;
  role.description = req.body.description ?? role.description;
  role.permissions = nextPerms;
  await role.save();

  logActivity(req, {
    action: 'role.update', entityType: 'role', entityId: role._id,
    summary: `Updated permissions for role "${role.name}"`,
    before, after: { name: role.name, permissions: role.permissions },
  });
  res.json(role);
}));

router.delete('/:id', requirePermission('role', 'delete'), wrap(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role || role.deletedAt) return res.status(404).json({ error: 'Role not found' });
  if (role.isSystem) throw httpError(400, 'Built-in roles cannot be deleted');

  const holders = await User.countDocuments({ role: role._id, deletedAt: null });
  if (holders > 0) {
    throw httpError(409, `${holders} user${holders > 1 ? 's' : ''} still hold this role. Move them to another role first.`);
  }
  role.deletedAt = new Date();
  await role.save();
  logActivity(req, {
    action: 'role.delete', entityType: 'role', entityId: role._id,
    summary: `Deleted role "${role.name}"`, before: { permissions: role.permissions },
  });
  res.json({ ok: true });
}));

/** Bulk-move every holder of one role to another, so the first can be deleted. */
router.post('/:id/reassign', requirePermission('role', 'update'), wrap(async (req, res) => {
  const { toRole } = req.body;
  const target = await Role.findById(toRole);
  if (!target) return res.status(400).json({ error: 'Target role not found' });
  const r = await User.updateMany({ role: req.params.id, deletedAt: null }, { role: target._id });
  logActivity(req, {
    action: 'role.reassign', entityType: 'role', entityId: req.params.id,
    summary: `Moved ${r.modifiedCount} users to role "${target.name}"`,
  });
  res.json({ ok: true, moved: r.modifiedCount });
}));

module.exports = router;
module.exports.RESOURCES = RESOURCES;
