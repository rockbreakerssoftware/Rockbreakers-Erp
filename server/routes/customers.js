const { Customer, Site } = require('../models');
const { crudRouter, httpError } = require('../utils/crud');

module.exports = crudRouter(Customer, 'customer', {
  searchFields: ['name', 'contactPerson', 'phone'],
  sort: { name: 1 },
  beforeDelete: async (doc) => {
    const sites = await Site.countDocuments({ customer: doc._id, deletedAt: null });
    if (sites) throw httpError(409, `${sites} site(s) belong to this customer`);
  },
});
