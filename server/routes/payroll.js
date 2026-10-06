const express = require('express');
const ExcelJS = require('exceljs');
const { User, Attendance, SiteCheckIn, Leave, Holiday } = require('../models');
const { authenticate, requirePermission, visibleUserIds, logActivity } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/crud');

const router = express.Router();
router.use(authenticate);

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const round1 = (n) => Math.round(n * 10) / 10;

/** Every date string in a YYYY-MM month, plus its boundaries. */
function monthDays(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) throw httpError(400, 'Give the month as YYYY-MM');
  const year = Number(m[1]);
  const mon = Number(m[2]) - 1;
  if (mon < 0 || mon > 11) throw httpError(400, 'That is not a real month');

  const first = new Date(year, mon, 1);
  const last = new Date(year, mon + 1, 0);
  const days = [];
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, mon, d);
    days.push({ date: key(date), dow: date.getDay() });
  }
  return { first, last, days, from: key(first), to: key(last) };
}

/**
 * Monthly attendance per employee, for setting salary.
 *
 * It deliberately computes no pay figure and holds no salary rate. What counts
 * as a working day differs by employee and season in this business, so the job
 * here is to lay out the facts — days marked, hours worked, time on site, leave
 * and gaps — and let the accountant decide. Inventing a formula would quietly
 * make that decision for them.
 */
async function buildPayroll(req, month) {
  const { days, from, to } = monthDays(month);
  const dayKeys = days.map((d) => d.date);

  const userFilter = { deletedAt: null };
  const ids = await visibleUserIds(req);
  if (ids) userFilter._id = { $in: ids };
  if (req.query.department) userFilter.department = req.query.department;
  if (req.query.includeInactive !== 'true') userFilter.active = true;

  const employees = await User.find(userFilter)
    .select('name email employeeCode designation department role joinedOn active')
    .populate('department', 'name').populate('role', 'name')
    .sort({ name: 1 }).lean();

  const empIds = employees.map((e) => e._id);

  const [attendance, checkIns, leaves, holidays] = await Promise.all([
    Attendance.find({ user: { $in: empIds }, date: { $gte: from, $lte: to } }).lean(),
    SiteCheckIn.find({ user: { $in: empIds }, date: { $gte: from, $lte: to } })
      .populate('site', 'name').lean(),
    Leave.find({ user: { $in: empIds }, status: 'APPROVED', from: { $lte: to }, to: { $gte: from } }).lean(),
    Holiday.find({ date: { $gte: from, $lte: to } }).lean(),
  ]);

  const holidayByDate = Object.fromEntries(holidays.map((h) => [h.date, h.name]));

  const index = (list, fn) => {
    const map = new Map();
    for (const item of list) {
      const k = String(fn(item));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  };
  const attByUser = index(attendance, (a) => a.user);
  const ciByUser = index(checkIns, (c) => c.user);
  const leaveByUser = index(leaves, (l) => l.user);

  const rows = employees.map((emp) => {
    const uid = String(emp._id);
    const att = Object.fromEntries((attByUser.get(uid) || []).map((a) => [a.date, a]));
    const cis = ciByUser.get(uid) || [];
    const myLeaves = leaveByUser.get(uid) || [];

    const leaveDates = new Set();
    for (const l of myLeaves) {
      for (const d of dayKeys) if (d >= l.from && d <= l.to) leaveDates.add(d);
    }

    const ciByDate = {};
    for (const c of cis) (ciByDate[c.date] ||= []).push(c);

    const daily = days.map(({ date, dow }) => {
      const a = att[date];
      const dayCheckIns = ciByDate[date] || [];
      const onLeave = leaveDates.has(date);
      const holiday = holidayByDate[date];

      const minutesOnSite = dayCheckIns.reduce((s, c) => s + (c.minutesOnSite || 0), 0);
      let status = 'NO_RECORD';
      if (a?.checkIn?.at) status = a.checkOut?.at ? 'PRESENT' : 'PRESENT_NO_CHECKOUT';
      else if (onLeave) status = 'LEAVE';
      else if (holiday) status = 'HOLIDAY';
      else if (dayCheckIns.length) status = 'SITE_ONLY'; // on a site but never marked the day

      return {
        date,
        dow,
        isSunday: dow === 0,
        status,
        holiday: holiday || null,
        onLeave,
        in: a?.checkIn?.at || null,
        out: a?.checkOut?.at || null,
        workedMinutes: a?.workedMinutes || 0,
        siteVisits: dayCheckIns.length,
        siteNames: dayCheckIns.map((c) => c.site?.name).filter(Boolean),
        minutesOnSite,
        flags: [
          ...(a?.checkIn?.flags || []),
          ...dayCheckIns.flatMap((c) => c.in?.flags || []),
        ],
        outOfGeofence: dayCheckIns.filter((c) => c.outOfGeofence).length,
      };
    });

    const count = (fn) => daily.filter(fn).length;
    const sum = (fn) => daily.reduce((s, d) => s + fn(d), 0);
    const worked = (d) => d.status === 'PRESENT' || d.status === 'PRESENT_NO_CHECKOUT';

    // Leave and holiday counts come from the calendar, not from the day's
    // status. Someone who marks attendance on a holiday is Present for that
    // day, but the holiday still happened and the accountant still needs to
    // see it — deriving these from status would quietly erase both facts.
    return {
      user: {
        _id: emp._id, name: emp.name, employeeCode: emp.employeeCode || '',
        designation: emp.designation || '', department: emp.department?.name || '',
        role: emp.role?.name || '', active: emp.active,
      },
      daysInMonth: days.length,
      present: count(worked),
      completeDays: count((d) => d.status === 'PRESENT'),
      missingCheckout: count((d) => d.status === 'PRESENT_NO_CHECKOUT'),
      leaveDays: count((d) => d.onLeave),
      holidays: count((d) => !!d.holiday),
      workedOnHoliday: count((d) => d.holiday && worked(d)),
      markedWhileOnLeave: count((d) => d.onLeave && worked(d)),
      siteOnlyDays: count((d) => d.status === 'SITE_ONLY'),
      noRecord: count((d) => d.status === 'NO_RECORD'),
      sundays: count((d) => d.isSunday),
      workedOnSunday: count((d) => d.isSunday && worked(d)),
      workedHours: round1(sum((d) => d.workedMinutes) / 60),
      siteHours: round1(sum((d) => d.minutesOnSite) / 60),
      siteVisits: sum((d) => d.siteVisits),
      siteDays: count((d) => d.siteVisits > 0),
      flagged: sum((d) => d.outOfGeofence),
      daily,
    };
  });

  return { month, from, to, days, holidays, rows };
}

router.get('/', requirePermission('payroll', 'read'), wrap(async (req, res) => {
  const month = req.query.month || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  res.json(await buildPayroll(req, month));
}));

/* ----------------------------------------------------------- export */

const HEAD = { bold: true, color: { argb: 'FFFFFFFF' } };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14161A' } };

function styleHeader(sheet, row = 1) {
  const r = sheet.getRow(row);
  r.font = HEAD;
  r.fill = HEAD_FILL;
  r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  r.height = 28;
}

router.get('/export', requirePermission('payroll', 'read'), wrap(async (req, res) => {
  const month = req.query.month || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  const data = await buildPayroll(req, month);

  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rockbreakers FSM';
  wb.created = new Date();

  /* --- sheet 1: one row per employee ------------------------------- */
  const s1 = wb.addWorksheet('Monthly summary', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  s1.columns = [
    { header: 'Employee', key: 'name', width: 24 },
    { header: 'Code', key: 'code', width: 10 },
    { header: 'Department', key: 'dept', width: 16 },
    { header: 'Designation', key: 'desig', width: 20 },
    { header: 'Days in month', key: 'dim', width: 12 },
    { header: 'Days present', key: 'present', width: 12 },
    { header: 'Complete days (in + out)', key: 'complete', width: 14 },
    { header: 'Missing check-out', key: 'missing', width: 13 },
    { header: 'Approved leave', key: 'leave', width: 12 },
    { header: 'Holidays', key: 'hol', width: 10 },
    { header: 'Worked on holiday', key: 'workedHol', width: 13 },
    { header: 'Sundays', key: 'sun', width: 9 },
    { header: 'Worked on Sunday', key: 'workedSun', width: 13 },
    { header: 'No record', key: 'none', width: 11 },
    { header: 'Hours worked', key: 'hours', width: 12 },
    { header: 'Days on site', key: 'siteDays', width: 11 },
    { header: 'Site visits', key: 'visits', width: 10 },
    { header: 'Hours on site', key: 'siteHours', width: 12 },
    { header: 'Geofence flags', key: 'flagged', width: 13 },
  ];
  for (const r of data.rows) {
    s1.addRow({
      name: r.user.name, code: r.user.employeeCode, dept: r.user.department, desig: r.user.designation,
      dim: r.daysInMonth, present: r.present, complete: r.completeDays, missing: r.missingCheckout,
      leave: r.leaveDays, hol: r.holidays, workedHol: r.workedOnHoliday,
      sun: r.sundays, workedSun: r.workedOnSunday, none: r.noRecord,
      hours: r.workedHours, siteDays: r.siteDays, visits: r.siteVisits,
      siteHours: r.siteHours, flagged: r.flagged,
    });
  }
  styleHeader(s1);
  s1.autoFilter = { from: 'A1', to: { row: 1, column: s1.columns.length } };
  s1.getColumn('hours').numFmt = '0.0';
  s1.getColumn('siteHours').numFmt = '0.0';
  // Deliberately no salary column: this sheet is the input to that decision,
  // not the decision. Add your own rate column alongside it.

  /* --- sheet 2: one row per employee per day ----------------------- */
  const s2 = wb.addWorksheet('Daily detail', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  s2.columns = [
    { header: 'Employee', key: 'name', width: 24 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'dow', width: 6 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Check in', key: 'in', width: 10 },
    { header: 'Check out', key: 'out', width: 10 },
    { header: 'Hours worked', key: 'hours', width: 12 },
    { header: 'Site visits', key: 'visits', width: 10 },
    { header: 'Sites', key: 'sites', width: 30 },
    { header: 'Hours on site', key: 'siteHours', width: 12 },
    { header: 'Notes', key: 'notes', width: 28 },
  ];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '');
  const LABEL = {
    PRESENT: 'Present', PRESENT_NO_CHECKOUT: 'Present (no check-out)',
    LEAVE: 'Approved leave', HOLIDAY: 'Holiday',
    SITE_ONLY: 'On site, day not marked', NO_RECORD: 'No record',
  };
  for (const r of data.rows) {
    for (const d of r.daily) {
      const notes = [];
      if (d.holiday) notes.push(d.holiday);
      if (d.onLeave && (d.status === 'PRESENT' || d.status === 'PRESENT_NO_CHECKOUT')) {
        notes.push('marked attendance during approved leave');
      }
      if (d.outOfGeofence) notes.push(`${d.outOfGeofence} check-in outside geofence`);
      if (d.flags.includes('LOW_ACCURACY')) notes.push('low GPS accuracy');
      if (d.flags.includes('CLOCK_SKEW')) notes.push('device clock differs from server');
      s2.addRow({
        name: r.user.name, date: d.date, dow: DOW[d.dow], status: LABEL[d.status],
        in: time(d.in), out: time(d.out),
        hours: round1(d.workedMinutes / 60), visits: d.siteVisits,
        sites: d.siteNames.join(', '), siteHours: round1(d.minutesOnSite / 60),
        notes: notes.join('; '),
      });
    }
  }
  styleHeader(s2);
  s2.autoFilter = { from: 'A1', to: { row: 1, column: s2.columns.length } };
  s2.getColumn('hours').numFmt = '0.0';
  s2.getColumn('siteHours').numFmt = '0.0';

  /* --- sheet 3: what the numbers mean ------------------------------ */
  const s3 = wb.addWorksheet('How to read this');
  s3.columns = [{ header: 'Column', key: 'c', width: 26 }, { header: 'Meaning', key: 'm', width: 92 }];
  [
    ['Report', `Attendance for ${label}, generated ${new Date().toLocaleString('en-IN')}`],
    ['Days present', 'Days the employee marked attendance with a selfie and location.'],
    ['Complete days', 'Days with both a check-in and a check-out. Use this for full-day pay.'],
    ['Missing check-out', 'Marked the start of the day but never closed it. Hours worked is unknown on these days.'],
    ['Approved leave', 'Days inside an approved leave request.'],
    ['Holidays', 'Company holidays falling in this month, whether or not the employee worked them.'],
    ['Worked on holiday', 'Days the employee marked attendance on a company holiday. Usually paid differently.'],
    ['Sundays', 'Shown separately because weekly-off policy is not fixed in this system.'],
    ['Worked on Sunday', 'Sundays the employee marked attendance. Treat per your own weekly-off policy.'],
    ['No record', 'No attendance, no leave, not a holiday. Absent, or simply never marked — check before deducting.'],
    ['Hours worked', 'Sum of check-in to check-out, for days where both exist.'],
    ['Days on site / Site visits', 'Site check-ins are separate from daily attendance. One day can hold several site visits.'],
    ['Hours on site', 'Time between arriving at and leaving a customer site.'],
    ['Geofence flags', 'Check-ins recorded outside the site boundary. Flagged for review, not proof of anything by itself.'],
    ['Salary', 'Not calculated here on purpose. This sheet is the input to that decision — add your own rate and formula.'],
  ].forEach(([c, m]) => s3.addRow({ c, m }));
  styleHeader(s3);
  s3.getColumn('c').font = { bold: true };
  s3.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
  styleHeader(s3);

  logActivity(req, {
    action: 'payroll.export', entityType: 'payroll', entityId: month,
    summary: `Exported attendance for ${label} (${data.rows.length} employees)`,
  });

  const file = `Rockbreakers-attendance-${month}.xlsx`;
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="${file}"`);
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
