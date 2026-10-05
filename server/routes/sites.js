const { Site, Job } = require('../models');
const { crudRouter, httpError } = require('../utils/crud');

module.exports = crudRouter(Site, 'site', {
  populate: { path: 'customer', select: 'name' },
  searchFields: ['name', 'code', 'city', 'address'],
  sort: { name: 1 },
  beforeDelete: async (doc) => {
    const jobs = await Job.countDocuments({ site: doc._id, status: { $nin: ['CLOSED', 'CANCELLED'] }, deletedAt: null });
    if (jobs) throw httpError(409, `${jobs} open job(s) are scheduled on this site`);
  },
});
