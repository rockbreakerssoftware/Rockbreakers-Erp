const jwt = require('jsonwebtoken');
const { User, ActivityLog } = require('../models');

const COOKIE = 'rb_token';
const SCOPES = ['own', 'team', 'department', 'all'];

function sign(user) {
  return jwt.sign({ uid: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/** Loads req.user (with role + department populated) from the JWT cookie. */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE] || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const { uid } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(uid).populate('role').populate('department');
    if (!user || !user.active || user.deletedAt) {
      return res.status(401).json({ error: 'Account is inactive' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

/** Highest scope the user holds for resource:action, or null. */
function scopeFor(user, resource, action) {
  const perms = user.role?.permissions || [];
  if (perms.includes('*')) return 'all';
  let best = null;
  for (const p of perms) {
    const [r, a, s] = p.split(':');
    const matches = (r === resource || r === '*') && (a === action || a === '*');
    if (!matches) continue;
    if (best === null || SCOPES.indexOf(s) > SCOPES.indexOf(best)) best = s;
  }
  return best;
}

const can = (user, resource, action) => scopeFor(user, resource, action) != null;

/**
 * Gate a route on resource:action and attach the scope.
 * Controllers use req.scope to narrow their own queries — the scope must
 * shape the database query, it is never a post-fetch filter.
 */
function requirePermission(resource, action) {
  return (req, res, next) => {
    const scope = scopeFor(req.user, resource, action);
    if (!scope) {
      return res.status(403).json({ error: `You do not have permission to ${action} ${resource}` });
    }
    req.scope = scope;
    next();
  };
}

/** Mongo filter for a user-owned resource, given the caller's scope. */
async function scopeFilter(req, { ownerField = 'user', departmentField = 'department' } = {}) {
  const me = req.user;
  switch (req.scope) {
    case 'all':
      return {};
    case 'department':
      return me.department ? { [departmentField]: me.department._id } : { [ownerField]: me._id };
    case 'team': {
      const team = await User.find({ reportsTo: me._id }).select('_id').lean();
      return { [ownerField]: { $in: [me._id, ...team.map((u) => u._id)] } };
    }
    default:
      return { [ownerField]: me._id };
  }
}

/** Ids the caller may act on behalf of (self + reports, or everyone). */
async function visibleUserIds(req) {
  const me = req.user;
  if (req.scope === 'all') return null; // null == no restriction
  if (req.scope === 'department' && me.department) {
    const users = await User.find({ department: me.department._id }).select('_id').lean();
    return users.map((u) => u._id);
  }
  if (req.scope === 'team') {
    const team = await User.find({ reportsTo: me._id }).select('_id').lean();
    return [me._id, ...team.map((u) => u._id)];
  }
  return [me._id];
}

/** Append-only audit trail. Fire-and-forget; never blocks the response. */
function logActivity(req, { action, entityType, entityId, summary, before, after }) {
  ActivityLog.create({
    actor: req.user?._id,
    actorName: req.user?.name,
    actorRole: req.user?.role?.name,
    action,
    entityType,
    entityId: entityId ? String(entityId) : undefined,
    summary,
    before,
    after,
    ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
    userAgent: req.headers['user-agent'],
    at: new Date(),
  }).catch(() => {});
}

module.exports = {
  COOKIE, SCOPES, sign, setAuthCookie, authenticate,
  scopeFor, can, requirePermission, scopeFilter, visibleUserIds, logActivity,
};
