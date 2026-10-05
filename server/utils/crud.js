const express = require('express');
const { authenticate, requirePermission, logActivity } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Builds a standard CRUD router for a master-data model.
 * Soft delete is the default everywhere: nothing in an approval chain is
 * ever hard-deleted, because the audit trail is the point of the system.
 */
function crudRouter(Model, resource, opts = {}) {
  const {
    populate = '',
    searchFields = ['name'],
    sort = { createdAt: -1 },
    beforeDelete,            // async (doc, req) => throw to block
    transform,               // async (body, req) => body
    listFilter,              // async (req) => extra mongo filter
  } = opts;

  const router = express.Router();
  router.use(authenticate);

  router.get('/', requirePermission(resource, 'read'), wrap(async (req, res) => {
    const filter = { deletedAt: null, ...(listFilter ? await listFilter(req) : {}) };
    if (req.query.q) {
      filter.$or = searchFields.map((f) => ({ [f]: new RegExp(escapeRx(req.query.q), 'i') }));
    }
    if (req.query.active === 'true') filter.active = true;
    let q = Model.find(filter).sort(sort);
    if (populate) q = q.populate(populate);
    res.json(await q.lean());
  }));

  router.get('/:id', requirePermission(resource, 'read'), wrap(async (req, res) => {
    let q = Model.findOne({ _id: req.params.id, deletedAt: null });
    if (populate) q = q.populate(populate);
    const doc = await q.lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  }));

  router.post('/', requirePermission(resource, 'create'), wrap(async (req, res) => {
    const body = transform ? await transform(req.body, req) : req.body;
    const doc = await Model.create(body);
    logActivity(req, {
      action: `${resource}.create`, entityType: resource, entityId: doc._id,
      summary: `Created ${resource} "${doc.name || doc.title || doc._id}"`, after: doc.toObject(),
    });
    res.status(201).json(doc);
  }));

  router.put('/:id', requirePermission(resource, 'update'), wrap(async (req, res) => {
    const before = await Model.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: 'Not found' });
    const body = transform ? await transform(req.body, req) : req.body;
    delete body._id;
    const doc = await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    logActivity(req, {
      action: `${resource}.update`, entityType: resource, entityId: doc._id,
      summary: `Updated ${resource} "${doc.name || doc.title || doc._id}"`,
      before, after: doc.toObject(),
    });
    res.json(doc);
  }));

  router.delete('/:id', requirePermission(resource, 'delete'), wrap(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc || doc.deletedAt) return res.status(404).json({ error: 'Not found' });
    if (beforeDelete) await beforeDelete(doc, req);
    doc.deletedAt = new Date();
    if ('active' in doc) doc.active = false;
    await doc.save();
    logActivity(req, {
      action: `${resource}.delete`, entityType: resource, entityId: doc._id,
      summary: `Deleted ${resource} "${doc.name || doc.title || doc._id}"`, before: doc.toObject(),
    });
    res.json({ ok: true });
  }));

  return router;
}

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Throw a clean HTTP error from a controller. */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { crudRouter, wrap, httpError, escapeRx };
