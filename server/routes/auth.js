const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { sign, setAuthCookie, COOKIE, authenticate, logActivity } = require('../middleware/auth');
const { wrap } = require('../utils/crud');

const router = express.Router();

const shape = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  designation: u.designation,
  role: u.role && { _id: u.role._id, name: u.role.name, key: u.role.key, permissions: u.role.permissions },
  department: u.department && { _id: u.department._id, name: u.department.name, key: u.department.key },
  sites: u.sites,
  baseLocation: u.baseLocation,
});

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email, deletedAt: null })
    .select('+passwordHash').populate('role').populate('department');

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been deactivated' });

  setAuthCookie(res, sign(user));
  req.user = user;
  logActivity(req, { action: 'auth.login', entityType: 'user', entityId: user._id, summary: `${user.name} signed in` });
  res.json(shape(user));
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => res.json(shape(req.user)));

router.post('/change-password', authenticate, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  logActivity(req, { action: 'auth.password_change', entityType: 'user', entityId: user._id, summary: 'Changed own password' });
  res.json({ ok: true });
}));

module.exports = router;
