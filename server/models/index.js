const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const oid = (ref, opts = {}) => ({ type: Schema.Types.ObjectId, ref, ...opts });
const base = { timestamps: true };

/* ---------------------------------------------------------------- org */

const DepartmentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: String,
  deletedAt: Date,
}, base);

const RoleSchema = new Schema({
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: String,
  // "resource:action:scope" e.g. "job:update:team"
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false },
  deletedAt: Date,
}, base);

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  passwordHash: { type: String, required: true, select: false },
  employeeCode: String,
  role: oid('Role', { required: true }),
  department: oid('Department'),
  reportsTo: oid('User'),
  sites: [oid('Site')],
  skills: { type: [String], default: [] },
  designation: String,
  joinedOn: Date,
  baseLocation: { lat: Number, lng: Number, label: String },
  active: { type: Boolean, default: true },
  deletedAt: Date,
}, base);

UserSchema.index({ department: 1, active: 1 });

/* -------------------------------------------------------------- sites */

const CustomerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  contactPerson: String,
  phone: String,
  email: String,
  address: String,
  deletedAt: Date,
}, base);

const SiteSchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: String,
  customer: oid('Customer'),
  address: String,
  city: String,
  state: String,
  location: { lat: Number, lng: Number },
  geofenceRadius: { type: Number, default: 300 }, // metres
  contactPerson: String,
  contactPhone: String,
  machines: [{
    name: String,
    model: String,
    serialNo: String,
    installedOn: Date,
  }],
  active: { type: Boolean, default: true },
  deletedAt: Date,
}, base);

/* --------------------------------------------------------------- jobs */

const JOB_TYPES = ['INSPECTION', 'BREAKDOWN', 'PREVENTIVE', 'INSTALLATION', 'TRAINING'];
const JOB_STATUS = ['DRAFT', 'SCHEDULED', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'WORK_DONE', 'CLOSED', 'CANCELLED'];
const JOB_PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const JobSchema = new Schema({
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: JOB_TYPES, default: 'INSPECTION' },
  status: { type: String, enum: JOB_STATUS, default: 'SCHEDULED' },
  priority: { type: String, enum: JOB_PRIORITY, default: 'NORMAL' },
  site: oid('Site', { required: true }),
  customer: oid('Customer'),
  department: oid('Department'),
  description: String,
  machines: [String],
  scheduledStart: { type: Date, required: true },
  scheduledEnd: { type: Date, required: true },
  assignments: [{
    user: oid('User', { required: true }),
    roleOnJob: { type: String, enum: ['LEAD', 'MEMBER', 'TRAINEE'], default: 'MEMBER' },
    status: { type: String, enum: ['ASSIGNED', 'ACCEPTED', 'DECLINED'], default: 'ASSIGNED' },
    acceptedAt: Date,
    note: String,
  }],
  holdReason: String,
  completionNotes: String,
  closedAt: Date,
  closedBy: oid('User'),
  createdBy: oid('User'),
  deletedAt: Date,
}, base);

JobSchema.index({ 'assignments.user': 1, scheduledStart: 1 });
JobSchema.index({ site: 1, scheduledStart: 1 });
JobSchema.index({ status: 1, scheduledStart: 1 });

/* --------------------------------------------------- proof of presence */

const pointFields = () => ({
  media: oid('Media'),
  lat: Number,
  lng: Number,
  accuracy: Number,
  address: String,
  at: Date,            // device clock
  receivedAt: Date,    // server clock
  flags: { type: [String], default: [] },
});

const AttendanceSchema = new Schema({
  user: oid('User', { required: true }),
  date: { type: String, required: true }, // YYYY-MM-DD, local
  checkIn: pointFields(),
  checkOut: pointFields(),
  workedMinutes: Number,
  note: String,
}, base);

AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

const SiteCheckInSchema = new Schema({
  job: oid('Job', { required: true }),
  site: oid('Site', { required: true }),
  user: oid('User', { required: true }),
  date: { type: String, required: true },
  in: pointFields(),
  out: pointFields(),
  distanceMeters: Number,
  outOfGeofence: { type: Boolean, default: false },
  minutesOnSite: Number,
  reviewStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedBy: oid('User'),
  reviewNote: String,
}, base);

SiteCheckInSchema.index({ job: 1, user: 1, date: 1 }, { unique: true });
SiteCheckInSchema.index({ user: 1, date: 1 });

/* ------------------------------------------------------- field records */

const CaptureSchema = new Schema({
  job: oid('Job', { required: true }),
  site: oid('Site'),
  user: oid('User'),
  media: oid('Media', { required: true }),
  phase: { type: String, enum: ['BEFORE', 'DURING', 'AFTER'], default: 'DURING' },
  tags: { type: [String], default: [] },
  note: String,
  lat: Number,
  lng: Number,
  at: Date,
  deletedAt: Date,
  deleteReason: String,
}, base);

CaptureSchema.index({ job: 1, createdAt: -1 });

const RequirementSchema = new Schema({
  job: oid('Job', { required: true }),
  site: oid('Site'),
  raisedBy: oid('User'),
  items: [{
    name: { type: String, required: true },
    partNo: String,
    quantity: { type: Number, default: 1 },
    unit: { type: String, default: 'nos' },
    note: String,
  }],
  urgency: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
  status: {
    type: String,
    enum: ['SUBMITTED', 'MANAGER_APPROVED', 'REJECTED', 'IN_PURCHASE', 'FULFILLED'],
    default: 'SUBMITTED',
  },
  expectedDate: Date,
  approvals: [{
    by: oid('User'),
    action: String,
    note: String,
    at: Date,
  }],
  deletedAt: Date,
}, base);

const EXPENSE_CATEGORIES = ['TRAVEL', 'FOOD', 'LODGING', 'TOLL', 'FUEL', 'CONSUMABLE', 'OTHER'];

const ExpenseSchema = new Schema({
  user: oid('User', { required: true }),
  job: oid('Job'),
  site: oid('Site'),
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: String, required: true },
  description: String,
  receipt: oid('Media'),
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'VERIFIED', 'REIMBURSED', 'REJECTED'],
    default: 'SUBMITTED',
  },
  approvals: [{ by: oid('User'), action: String, note: String, at: Date }],
  deletedAt: Date,
}, base);

ExpenseSchema.index({ user: 1, date: -1 });
ExpenseSchema.index({ status: 1 });

/* ------------------------------------------------------- hr & calendar */

const LeaveSchema = new Schema({
  user: oid('User', { required: true }),
  type: { type: String, enum: ['CASUAL', 'SICK', 'EARNED', 'UNPAID'], default: 'CASUAL' },
  from: { type: String, required: true },
  to: { type: String, required: true },
  reason: String,
  status: { type: String, enum: ['REQUESTED', 'APPROVED', 'REJECTED'], default: 'REQUESTED' },
  actionedBy: oid('User'),
}, base);

const HolidaySchema = new Schema({
  name: { type: String, required: true },
  date: { type: String, required: true },
}, base);

/* --------------------------------------------------------------- misc */

const MediaSchema = new Schema({
  data: { type: Buffer, required: true, select: false },
  contentType: { type: String, default: 'image/jpeg' },
  size: Number,
  kind: { type: String, enum: ['SELFIE', 'CAPTURE', 'RECEIPT', 'OTHER'], default: 'OTHER' },
  uploadedBy: oid('User'),
}, base);

const ActivityLogSchema = new Schema({
  actor: oid('User'),
  actorName: String,
  actorRole: String,
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  summary: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  at: { type: Date, default: Date.now },
}, { timestamps: false });

ActivityLogSchema.index({ at: -1 });
ActivityLogSchema.index({ entityType: 1, entityId: 1 });

module.exports = {
  Department: model('Department', DepartmentSchema),
  Role: model('Role', RoleSchema),
  User: model('User', UserSchema),
  Customer: model('Customer', CustomerSchema),
  Site: model('Site', SiteSchema),
  Job: model('Job', JobSchema),
  Attendance: model('Attendance', AttendanceSchema),
  SiteCheckIn: model('SiteCheckIn', SiteCheckInSchema),
  Capture: model('Capture', CaptureSchema),
  Requirement: model('Requirement', RequirementSchema),
  Expense: model('Expense', ExpenseSchema),
  Leave: model('Leave', LeaveSchema),
  Holiday: model('Holiday', HolidaySchema),
  Media: model('Media', MediaSchema),
  ActivityLog: model('ActivityLog', ActivityLogSchema),
  JOB_TYPES, JOB_STATUS, JOB_PRIORITY, EXPENSE_CATEGORIES,
};
