require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Department, Role, User, Customer, Site, Job, Holiday } = require('../models');

/* Permission helpers: "resource:action:scope" */
const all = (resource, actions) => actions.map((a) => `${resource}:${a}:all`);
const own = (resource, actions) => actions.map((a) => `${resource}:${a}:own`);
const dept = (resource, actions) => actions.map((a) => `${resource}:${a}:department`);
const team = (resource, actions) => actions.map((a) => `${resource}:${a}:team`);

const CRUD = ['create', 'read', 'update', 'delete'];

const ROLES = [
  {
    key: 'super_admin', name: 'Super Admin', isSystem: true,
    description: 'Unrestricted access, including roles and permissions.',
    permissions: ['*'],
  },
  {
    key: 'admin', name: 'Admin', isSystem: true,
    description: 'Manages users, roles and master data across the company.',
    permissions: [
      ...all('user', CRUD), ...all('role', CRUD), ...all('department', CRUD),
      ...all('customer', CRUD), ...all('site', CRUD),
      ...all('job', [...CRUD, 'assign', 'close']),
      ...all('attendance', ['read', 'approve']),
      ...all('capture', ['create', 'read', 'delete']),
      ...all('requirement', ['create', 'read', 'update', 'approve']),
      ...all('expense', ['read', 'update', 'approve', 'reimburse']),
      ...all('leave', ['read', 'approve']), ...all('payroll', ['read']),
      ...all('report', ['read']), ...all('log', ['read']),
    ],
  },
  {
    key: 'service_manager', name: 'Service Manager', isSystem: true,
    description: 'Schedules jobs, assigns crews and approves field work for the service team.',
    permissions: [
      ...team('user', ['read']), ...all('site', ['read', 'create', 'update']), ...all('customer', ['read']),
      ...all('job', [...CRUD, 'assign', 'close']),
      ...team('attendance', ['read', 'approve']),
      ...all('capture', ['create', 'read']),
      ...team('requirement', ['read', 'approve']), ...own('requirement', ['create']),
      ...team('expense', ['read', 'approve']), ...own('expense', ['create']),
      ...team('leave', ['read', 'approve']), ...own('leave', ['create']),
      ...team('payroll', ['read']),
      ...all('report', ['read']), 'log:read:team',
    ],
  },
  {
    key: 'engineer', name: 'Engineer', isSystem: true,
    description: 'Field engineer: own calendar, attendance, site evidence and expenses.',
    permissions: [
      'user:read:own',
      // Read-only on sites so the expense form can offer a site list. It does
      // not surface a Sites section, which is gated on being able to manage them.
      'site:read:all',
      ...own('job', ['read']), 'job:update:own',
      ...own('attendance', ['create', 'read']),
      ...own('capture', ['create', 'read']),
      ...own('requirement', ['create', 'read']),
      ...own('expense', ['create', 'read', 'update']),
      ...own('leave', ['create', 'read']),
      'report:read:own',
    ],
  },
  {
    key: 'sales_executive', name: 'Sales Executive', isSystem: true,
    description: 'Owns customers and turns approved requirements into quotations.',
    permissions: [
      'user:read:own', ...all('customer', CRUD), ...all('site', ['read', 'create', 'update']),
      ...all('job', ['read', 'create']), ...all('requirement', ['read', 'update']),
      ...own('expense', ['create', 'read']), ...own('leave', ['create', 'read']),
      ...own('attendance', ['create', 'read']), 'report:read:department',
    ],
  },
  {
    key: 'purchase_officer', name: 'Purchase Officer', isSystem: true,
    description: 'Checks availability and procures against approved requirements.',
    permissions: [
      'user:read:own', 'site:read:all',
      ...all('requirement', ['read', 'update', 'approve']),
      ...own('expense', ['create', 'read']), ...own('attendance', ['create', 'read']),
      ...own('leave', ['create', 'read']), 'report:read:department',
    ],
  },
  {
    key: 'accountant', name: 'Accountant', isSystem: true,
    description: 'Verifies and reimburses expenses, and reads monthly attendance for salary.',
    permissions: [
      // Reads people and sites to build payroll and tag own expenses, but
      // manages neither — so no Users or Sites section appears for them.
      'user:read:all', 'site:read:all',
      ...all('expense', ['read', 'update', 'approve', 'reimburse']), 'expense:create:own',
      ...all('attendance', ['read']), ...own('attendance', ['create']),
      ...all('payroll', ['read']),
      ...own('leave', ['create', 'read']), 'leave:read:all',
      ...all('report', ['read']), 'log:read:all',
    ],
  },
  {
    key: 'hr', name: 'HR', isSystem: true,
    description: 'Employee records, attendance, leave and monthly payroll input.',
    permissions: [
      ...all('user', ['create', 'read', 'update']), 'role:read:all', ...all('department', ['read']),
      ...all('attendance', ['read', 'approve']), ...all('leave', ['read', 'approve']),
      ...all('payroll', ['read']),
      ...own('expense', ['create', 'read']), ...own('attendance', ['create']),
      'site:read:all',
      'report:read:all', 'log:read:all',
    ],
  },
];

const DEPARTMENTS = [
  { key: 'service', name: 'Service' },
  { key: 'sales', name: 'Sales' },
  { key: 'purchase', name: 'Purchase' },
  { key: 'accounts', name: 'Accounts' },
  { key: 'hr', name: 'HR & Admin' },
];

async function seed({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;

  /* roles & departments are idempotent — safe to run on every boot */
  const roleMap = {};
  for (const r of ROLES) {
    const doc = await Role.findOneAndUpdate(
      { key: r.key },
      { $set: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    roleMap[r.key] = doc._id;
  }
  const deptMap = {};
  for (const d of DEPARTMENTS) {
    const doc = await Department.findOneAndUpdate(
      { key: d.key }, { $set: { name: d.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    deptMap[d.key] = doc._id;
  }
  log(`roles: ${Object.keys(roleMap).length}, departments: ${Object.keys(deptMap).length}`);

  if (await User.countDocuments({ deletedAt: null })) {
    log('users already exist — skipping demo data');
    return { roleMap, deptMap };
  }

  const pass = async (p) => bcrypt.hash(p, 10);
  const mk = async (name, email, roleKey, deptKey, extra = {}) =>
    User.create({
      name, email, passwordHash: await pass('rockbreakers123'),
      role: roleMap[roleKey], department: deptMap[deptKey], active: true, ...extra,
    });

  const admin = await mk('Ravindra Patil', 'admin@rockbreakers.in', 'super_admin', 'hr', {
    designation: 'Director', phone: '9000000001',
  });
  const manager = await mk('Suresh Kulkarni', 'manager@rockbreakers.in', 'service_manager', 'service', {
    designation: 'Service Manager', phone: '9000000002', reportsTo: admin._id,
  });
  const engineerNames = [
    ['Amit Deshmukh', 'amit@rockbreakers.in', ['Hydraulic breaker', 'Excavator']],
    ['Prakash Jadhav', 'prakash@rockbreakers.in', ['Crusher', 'Conveyor']],
    ['Nitin Shinde', 'nitin@rockbreakers.in', ['Hydraulic breaker', 'Welding']],
    ['Ganesh More', 'ganesh@rockbreakers.in', ['Electrical', 'Crusher']],
  ];
  const engineers = [];
  for (const [n, e, skills] of engineerNames) {
    engineers.push(await mk(n, e, 'engineer', 'service', {
      designation: 'Service Engineer', reportsTo: manager._id, skills,
    }));
  }
  await mk('Pooja Rane', 'sales@rockbreakers.in', 'sales_executive', 'sales', { designation: 'Sales Executive', reportsTo: admin._id });
  await mk('Vikram Sawant', 'purchase@rockbreakers.in', 'purchase_officer', 'purchase', { designation: 'Purchase Officer', reportsTo: admin._id });
  await mk('Meena Joshi', 'accounts@rockbreakers.in', 'accountant', 'accounts', { designation: 'Accountant', reportsTo: admin._id });

  const customers = await Customer.insertMany([
    { name: 'Sahyadri Stone Crushers', contactPerson: 'R. Bhosale', phone: '9823011111', address: 'Wagholi, Pune' },
    { name: 'Konkan Infra Projects', contactPerson: 'S. Naik', phone: '9823022222', address: 'Panvel, Raigad' },
    { name: 'Deccan Quarry Works', contactPerson: 'A. Pawar', phone: '9823033333', address: 'Shirur, Pune' },
  ]);

  const sites = await Site.insertMany([
    {
      name: 'Wagholi Quarry', code: 'WGH-01', customer: customers[0]._id,
      address: 'Survey 44, Wagholi', city: 'Pune', state: 'Maharashtra',
      location: { lat: 18.5793, lng: 73.9789 }, geofenceRadius: 400,
      contactPerson: 'R. Bhosale', contactPhone: '9823011111',
      machines: [{ name: 'Hydraulic Breaker', model: 'RB-450', serialNo: 'RB450-0912' }],
    },
    {
      name: 'Panvel Crusher Plant', code: 'PNV-02', customer: customers[1]._id,
      address: 'MIDC Phase II, Panvel', city: 'Raigad', state: 'Maharashtra',
      location: { lat: 18.9894, lng: 73.1175 }, geofenceRadius: 300,
      contactPerson: 'S. Naik', contactPhone: '9823022222',
      machines: [{ name: 'Jaw Crusher', model: 'JC-200', serialNo: 'JC200-4471' }],
    },
    {
      name: 'Shirur Pit 3', code: 'SHR-03', customer: customers[2]._id,
      address: 'Ranjangaon Road, Shirur', city: 'Pune', state: 'Maharashtra',
      location: { lat: 18.8277, lng: 74.3733 }, geofenceRadius: 500,
      contactPerson: 'A. Pawar', contactPhone: '9823033333',
      machines: [{ name: 'Hydraulic Breaker', model: 'RB-600', serialNo: 'RB600-2210' }],
    },
  ]);

  const day = (offset, hour = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  await Job.insertMany([
    {
      title: 'Breaker not developing pressure', type: 'BREAKDOWN', priority: 'URGENT', status: 'SCHEDULED',
      site: sites[0]._id, customer: customers[0]._id, department: deptMap.service,
      description: 'Operator reports loss of impact energy since Monday. Check accumulator charge and seal kit.',
      scheduledStart: day(0, 9), scheduledEnd: day(0, 17), createdBy: manager._id,
      assignments: [{ user: engineers[0]._id, roleOnJob: 'LEAD' }],
    },
    {
      title: 'RB-600 commissioning — Shirur Pit 3', type: 'INSTALLATION', priority: 'HIGH', status: 'SCHEDULED',
      site: sites[2]._id, customer: customers[2]._id, department: deptMap.service,
      description: 'Four-day commissioning: mounting, hydraulic line routing, pressure setting, operator handover.',
      scheduledStart: day(1, 8), scheduledEnd: day(4, 18), createdBy: manager._id,
      assignments: [
        { user: engineers[1]._id, roleOnJob: 'LEAD' },
        { user: engineers[2]._id, roleOnJob: 'MEMBER' },
        { user: engineers[3]._id, roleOnJob: 'TRAINEE' },
      ],
    },
    {
      title: 'Quarterly preventive service', type: 'PREVENTIVE', priority: 'NORMAL', status: 'SCHEDULED',
      site: sites[1]._id, customer: customers[1]._id, department: deptMap.service,
      description: 'Scheduled 500-hour service on the jaw crusher.',
      scheduledStart: day(2, 10), scheduledEnd: day(2, 16), createdBy: manager._id,
      assignments: [{ user: engineers[0]._id, roleOnJob: 'LEAD' }],
    },
    {
      title: 'Site survey for new breaker', type: 'INSPECTION', priority: 'NORMAL', status: 'SCHEDULED',
      site: sites[0]._id, customer: customers[0]._id, department: deptMap.service,
      description: 'Measure carrier compatibility and prepare quotation inputs.',
      scheduledStart: day(5, 11), scheduledEnd: day(5, 15), createdBy: manager._id,
      assignments: [{ user: engineers[2]._id, roleOnJob: 'LEAD' }],
    },
  ]);

  const y = new Date().getFullYear();
  await Holiday.insertMany([
    { name: 'Republic Day', date: `${y}-01-26` },
    { name: 'Independence Day', date: `${y}-08-15` },
    { name: 'Gandhi Jayanti', date: `${y}-10-02` },
  ]).catch(() => {});

  log('seeded demo data — sign in as admin@rockbreakers.in / rockbreakers123');
  return { roleMap, deptMap };
}

module.exports = { seed, ROLES, DEPARTMENTS };

if (require.main === module) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => seed())
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
