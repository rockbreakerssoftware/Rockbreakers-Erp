const { Department, User, Job } = require('../models');
const { crudRouter, httpError } = require('../utils/crud');

module.exports = crudRouter(Department, 'department', {
  searchFields: ['name', 'key'],
  sort: { name: 1 },
  transform: (body) => ({
    ...body,
    key: body.key || String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  }),
  beforeDelete: async (doc) => {
    const users = await User.countDocuments({ department: doc._id, deletedAt: null });
    if (users) throw httpError(409, `${users} user(s) still belong to this department`);
    const jobs = await Job.countDocuments({ department: doc._id, status: { $nin: ['CLOSED', 'CANCELLED'] }, deletedAt: null });
    if (jobs) throw httpError(409, `${jobs} open job(s) still belong to this department`);
  },
});
