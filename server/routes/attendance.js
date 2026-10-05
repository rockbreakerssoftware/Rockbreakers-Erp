const express = require('express');
const { Attendance, SiteCheckIn, Job, Site, Media } = require('../models');
const { authenticate, requirePermission, logActivity, visibleUserIds, scopeFor } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');
const { haversine, reverseGeocode, presenceFlags, todayKey } = require('../utils/geo');

const router = express.Router();
router.use(authenticate);

/**
 * Stores a base64 selfie. The client resizes before upload, so what arrives
 * is already ~60 KB — Render's free disk is ephemeral, which is why these
 * live in Mongo rather than on the filesystem.
 */
async function storeSelfie(dataUrl, userId) {
  if (!dataUrl) throw httpError(400, 'A selfie is required');
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw httpError(400, 'The selfie image is not readable');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 900 * 1024) throw httpError(413, 'That image is too large — please retake it');
  const media = await Media.create({
    data: buf, contentType: m[1], size: buf.length, kind: 'SELFIE', uploadedBy: userId,
  });
  return media._id;
}

/** Builds the common proof-of-presence block shared by both record types. */
async function buildPoint(body, userId) {
  const receivedAt = new Date();
  const media = await storeSelfie(body.selfie, userId);
  const address = await reverseGeocode(body.lat, body.lng);
  return {
    media,
    lat: body.lat,
    lng: body.lng,
    accuracy: body.accuracy,
    address,
    at: body.capturedAt ? new Date(body.capturedAt) : receivedAt,
    receivedAt,
    flags: presenceFlags({
      accuracy: body.accuracy,
      deviceAt: body.capturedAt,
      serverAt: receivedAt,
      mocked: body.mocked,
    }),
  };
}

/* ------------------------------------------------- daily attendance */

router.get('/today', wrap(async (req, res) => {
  const record = await Attendance.findOne({ user: req.user._id, date: todayKey() }).lean();
  res.json(record || null);
}));

router.post('/check-in', wrap(async (req, res) => {
  const date = req.body.date || todayKey();
  const existing = await Attendance.findOne({ user: req.user._id, date });
  if (existing?.checkIn?.at) throw httpError(409, 'You have already marked attendance today');

  const point = await buildPoint(req.body, req.user._id);
  const record = await Attendance.findOneAndUpdate(
    { user: req.user._id, date },
    { $set: { checkIn: point, note: req.body.note } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logActivity(req, {
    action: 'attendance.check_in', entityType: 'attendance', entityId: record._id,
    summary: `Marked attendance${point.address ? ` at ${point.address.split(',').slice(0, 2).join(',')}` : ''}${point.flags.length ? ` [${point.flags.join(', ')}]` : ''}`,
  });
  res.status(201).json(record);
}));

router.post('/check-out', wrap(async (req, res) => {
  const date = req.body.date || todayKey();
  const record = await Attendance.findOne({ user: req.user._id, date });
  if (!record?.checkIn?.at) throw httpError(400, 'You have not checked in today');
  if (record.checkOut?.at) throw httpError(409, 'You have already checked out today');

  record.checkOut = await buildPoint(req.body, req.user._id);
  record.workedMinutes = Math.round((record.checkOut.at - record.checkIn.at) / 60000);
  await record.save();
  logActivity(req, {
    action: 'attendance.check_out', entityType: 'attendance', entityId: record._id,
    summary: `Checked out after ${(record.workedMinutes / 60).toFixed(1)} h`,
  });
  res.json(record);
}));

router.get('/', requirePermission('attendance', 'read'), wrap(async (req, res) => {
  const filter = {};
  const ids = await visibleUserIds(req);
  if (ids) filter.user = { $in: ids };
  if (req.query.user) filter.user = req.query.user;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = req.query.from;
    if (req.query.to) filter.date.$lte = req.query.to;
  } else {
    filter.date = todayKey();
  }
  const records = await Attendance.find(filter)
    .populate('user', 'name designation').sort({ date: -1 }).limit(500).lean();
  res.json(records);
}));

/* --------------------------------------------------- site check-ins */

router.post('/site/:jobId/check-in', wrap(async (req, res) => {
  const job = await Job.findById(req.params.jobId).lean();
  if (!job || job.deletedAt) return res.status(404).json({ error: 'Job not found' });
  const assigned = job.assignments.some((a) => String(a.user) === String(req.user._id));
  if (!assigned) throw httpError(403, 'You are not assigned to this job');
  if (['CLOSED', 'CANCELLED'].includes(job.status)) throw httpError(400, 'This job is no longer open');

  const date = req.body.date || todayKey();
  const existing = await SiteCheckIn.findOne({ job: job._id, user: req.user._id, date });
  if (existing?.in?.at) throw httpError(409, 'You have already checked in to this site today');

  const site = await Site.findById(job.site).lean();
  const point = await buildPoint(req.body, req.user._id);

  const distance = site?.location?.lat != null
    ? haversine({ lat: point.lat, lng: point.lng }, site.location)
    : null;
  const radius = site?.geofenceRadius ?? 300;
  const outside = distance != null && distance > radius;
  // Outside the fence is flagged for review, never rejected: GPS drifts badly
  // at quarry sites and a hard block would strand someone who is really there.
  if (outside) point.flags.push('OUT_OF_GEOFENCE');

  const record = await SiteCheckIn.findOneAndUpdate(
    { job: job._id, user: req.user._id, date },
    {
      $set: {
        site: job.site, in: point, distanceMeters: distance, outOfGeofence: outside,
        reviewStatus: outside ? 'PENDING' : 'APPROVED',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (job.status === 'SCHEDULED' || job.status === 'ACCEPTED') {
    await Job.findByIdAndUpdate(job._id, { status: 'IN_PROGRESS' });
  }
  logActivity(req, {
    action: 'site.check_in', entityType: 'job', entityId: job._id,
    summary: `${req.user.name} checked in at ${site?.name || 'site'}${distance != null ? ` (${distance} m from centre)` : ''}${outside ? ' — OUTSIDE GEOFENCE' : ''}`,
  });
  res.status(201).json(record);
}));

router.post('/site/:jobId/check-out', wrap(async (req, res) => {
  const date = req.body.date || todayKey();
  const record = await SiteCheckIn.findOne({ job: req.params.jobId, user: req.user._id, date });
  if (!record?.in?.at) throw httpError(400, 'You have not checked in to this site today');
  if (record.out?.at) throw httpError(409, 'You have already checked out of this site today');

  record.out = await buildPoint(req.body, req.user._id);
  record.minutesOnSite = Math.round((record.out.at - record.in.at) / 60000);
  await record.save();
  logActivity(req, {
    action: 'site.check_out', entityType: 'job', entityId: req.params.jobId,
    summary: `${req.user.name} left site after ${(record.minutesOnSite / 60).toFixed(1)} h`,
  });
  res.json(record);
}));

router.get('/site', wrap(async (req, res) => {
  const filter = {};
  if (req.query.job) filter.job = req.query.job;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.date) filter.date = req.query.date;
  if (req.query.flagged === 'true') filter.outOfGeofence = true;

  // Who may this caller see? Scope narrows the query itself, so a reviewer
  // asking for flagged check-ins gets their team's — not only their own,
  // and never the whole company unless their scope says so.
  req.scope = scopeFor(req.user, 'attendance', 'approve')
    || scopeFor(req.user, 'attendance', 'read')
    || 'own';

  if (req.scope === 'own') {
    filter.user = req.user._id;
  } else if (!req.query.job) {
    const ids = await visibleUserIds(req);
    if (ids) filter.user = filter.user || { $in: ids };
  }

  const records = await SiteCheckIn.find(filter)
    .populate('user', 'name').populate('site', 'name city location geofenceRadius')
    .populate('job', 'title type').sort({ date: -1, createdAt: -1 }).limit(300).lean();
  res.json(records);
}));

/** Manager review of a flagged check-in. */
router.patch('/site/:id/review', requirePermission('attendance', 'approve'), wrap(async (req, res) => {
  const record = await SiteCheckIn.findById(req.params.id).populate('user', 'name');
  if (!record) return res.status(404).json({ error: 'Check-in not found' });
  record.reviewStatus = req.body.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
  record.reviewNote = req.body.note;
  record.reviewedBy = req.user._id;
  await record.save();
  logActivity(req, {
    action: 'site.review', entityType: 'sitecheckin', entityId: record._id,
    summary: `${record.reviewStatus === 'APPROVED' ? 'Approved' : 'Rejected'} flagged check-in for ${record.user?.name}${req.body.note ? ` — ${req.body.note}` : ''}`,
  });
  res.json(record);
}));

module.exports = router;
