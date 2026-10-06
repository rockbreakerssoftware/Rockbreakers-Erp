import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  Card, Button, Search, Select, Pill, Empty, Skeleton, Stat, Avatar, Banner, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import { fmtTime, fmtDate } from '../lib/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS = {
  PRESENT: { label: 'Present', tone: 'ok', short: 'P' },
  PRESENT_NO_CHECKOUT: { label: 'No check-out', tone: 'warn', short: 'P' },
  LEAVE: { label: 'Leave', tone: 'info', short: 'L' },
  HOLIDAY: { label: 'Holiday', tone: '', short: 'H' },
  SITE_ONLY: { label: 'On site, day not marked', tone: 'warn', short: 'S' },
  NO_RECORD: { label: 'No record', tone: 'bad', short: '—' },
};

const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function Payroll() {
  const toast = useToast();
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [departments, setDepartments] = useState([]);
  const [open, setOpen] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setData(null);
    api.get('/payroll', { month, department: dept || undefined })
      .then(setData).catch((e) => toast.error(e));
  }, [month, dept]); // eslint-disable-line

  useEffect(() => { api.get('/departments').then(setDepartments).catch(() => {}); }, []);

  const rows = useMemo(() => {
    if (!data) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return data.rows;
    return data.rows.filter((r) =>
      r.user.name.toLowerCase().includes(needle) ||
      r.user.employeeCode?.toLowerCase().includes(needle) ||
      r.user.designation?.toLowerCase().includes(needle));
  }, [data, q]);

  const totals = useMemo(() => {
    if (!rows?.length) return null;
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
    return {
      people: rows.length,
      present: sum((r) => r.present),
      hours: Math.round(sum((r) => r.workedHours) * 10) / 10,
      siteHours: Math.round(sum((r) => r.siteHours) * 10) / 10,
      leave: sum((r) => r.leaveDays),
      noRecord: sum((r) => r.noRecord),
      flagged: sum((r) => r.flagged),
    };
  }, [rows]);

  /** Downloads through fetch so the session cookie is sent and errors surface. */
  const download = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ month, ...(dept ? { department: dept } : {}) });
      const res = await fetch(`/api/payroll/export?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || 'The export could not be generated');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rockbreakers-attendance-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.ok('Excel file downloaded');
    } catch (e) {
      toast.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const monthLabel = new Date(`${month}-01T00:00:00`)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const shiftMonth = (n) => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(monthKey(d));
  };

  const isCurrentMonth = month === monthKey();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Salary &amp; attendance</div>
          <div className="page-sub">
            Monthly attendance for every employee, as the input to your salary decision
          </div>
        </div>
        <div className="page-actions">
          <Button icon="download" onClick={download} loading={downloading} variant="primary">
            Download Excel
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--s4)' }}>
        <Banner tone="info" icon="info">
          No pay is calculated here, and no salary rate is stored. What counts as a working day differs by
          person and season, so this lays out the facts — days marked, hours, time on site, leave and gaps —
          and leaves the judgement to you. The Excel file has a blank column ready for your own rate.
        </Banner>
      </div>

      <div className="row-b wrap" style={{ gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
        <div className="row" style={{ gap: 'var(--s1)' }}>
          <Button size="sm" icon="chevronLeft" onClick={() => shiftMonth(-1)} aria-label="Previous month" />
          <input type="month" className="input" value={month} max={monthKey()}
            onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
          <Button size="sm" icon="chevronRight" onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth} aria-label="Next month" />
          {!data && <span className="spinner" style={{ marginLeft: 8 }} />}
        </div>
        <div className="row wrap" style={{ gap: 'var(--s2)' }}>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} placeholder="All departments"
            options={departments.map((d) => ({ value: d._id, label: d.name }))} style={{ width: 170 }} />
          <Search value={q} onChange={setQ} placeholder="Search employee…" />
        </div>
      </div>

      {isCurrentMonth && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="alert">
            {monthLabel} is still running — days after today will show as “No record” until they happen.
          </Banner>
        </div>
      )}

      {totals && (
        <div className="grid grid-4" style={{ marginBottom: 'var(--s5)' }}>
          <Stat label="Employees" value={totals.people} hint={monthLabel} />
          <Stat label="Days marked present" value={totals.present} />
          <Stat label="Hours worked" value={totals.hours.toLocaleString('en-IN')} hint={`${totals.siteHours.toLocaleString('en-IN')} h on customer sites`} />
          <Stat label="Days with no record" value={totals.noRecord}
            tone={totals.noRecord ? 'warn' : 'ok'} hint={`${totals.leave} day(s) approved leave`} />
        </div>
      )}

      <Card bodyClass="tight">
        {!rows ? <Skeleton rows={8} /> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 190 }}>Employee</th>
                  <th className="num">Present</th>
                  <th className="num">Complete</th>
                  <th className="num">Leave</th>
                  <th className="num">Holiday</th>
                  <th className="num">No record</th>
                  <th className="num">Hours</th>
                  <th className="num">Site days</th>
                  <th className="num">Site hrs</th>
                  <th style={{ minWidth: 150 }}>Month at a glance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const expanded = open === r.user._id;
                  return (
                    <>
                      <tr key={r.user._id} className="clickable"
                        onClick={() => setOpen(expanded ? null : r.user._id)}>
                        <td>
                          <div className="row" style={{ gap: 'var(--s2)' }}>
                            <Avatar name={r.user.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <div className="cell-main truncate">{r.user.name}</div>
                              <div className="cell-sub truncate">
                                {[r.user.employeeCode, r.user.designation || r.user.role].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num strong">{r.present}</td>
                        <td className="num">{r.completeDays}</td>
                        <td className="num">{r.leaveDays || <span className="subtle">—</span>}</td>
                        <td className="num">
                          {r.holidays || <span className="subtle">—</span>}
                          {r.workedOnHoliday > 0 && (
                            <span title={`Worked ${r.workedOnHoliday} holiday(s)`}
                              style={{ color: 'var(--warn)', marginLeft: 4 }}>+{r.workedOnHoliday}</span>
                          )}
                        </td>
                        <td className="num">
                          {r.noRecord ? <span style={{ color: 'var(--bad)' }}>{r.noRecord}</span> : <span className="subtle">—</span>}
                        </td>
                        <td className="num strong">{r.workedHours.toFixed(1)}</td>
                        <td className="num">{r.siteDays || <span className="subtle">—</span>}</td>
                        <td className="num">{r.siteHours ? r.siteHours.toFixed(1) : <span className="subtle">—</span>}</td>
                        <td><MonthStrip daily={r.daily} /></td>
                        <td className="actions">
                          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={15}
                            style={{ color: 'var(--text-subtle)' }} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${r.user._id}-detail`}>
                          <td colSpan={11} style={{ padding: 0, background: 'var(--surface-2)', height: 'auto' }}>
                            <DailyDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="users" title={q ? 'No employee matches that search' : 'No employees to show'}
            text={q ? undefined : 'Add employees, or widen the department filter.'} />
        )}
      </Card>

      <div className="legend" style={{ marginTop: 'var(--s4)', justifyContent: 'center' }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <span key={k}>
            <i style={{ background: toneColor(v.tone) }} /> {v.label}
          </span>
        ))}
      </div>
    </>
  );
}

const toneColor = (tone) => ({
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)',
}[tone] || 'var(--border-strong)');

/** A one-square-per-day ribbon, so a month reads at a glance. */
function MonthStrip({ daily }) {
  return (
    <div style={{ display: 'flex', gap: 1.5 }}>
      {daily.map((d) => (
        <span
          key={d.date}
          title={`${d.date} (${DOW[d.dow]}) — ${STATUS[d.status].label}`}
          style={{
            width: 4, height: 15, borderRadius: 1,
            background: toneColor(STATUS[d.status].tone),
            opacity: d.status === 'NO_RECORD' && d.isSunday ? 0.3 : 1,
          }}
        />
      ))}
    </div>
  );
}

function DailyDetail({ row }) {
  // Sundays with nothing recorded are hidden: they are almost always a weekly
  // off and listing them buries the days that need a decision.
  const withActivity = row.daily.filter((d) => d.status !== 'NO_RECORD' || !d.isSunday);
  return (
    <div style={{ padding: 'var(--s4)' }}>
      <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
        <span className="label-xs">Day by day — {row.user.name}</span>
        <div className="row wrap" style={{ gap: 'var(--s2)' }}>
          <span className="small muted">
            {row.present} present · {row.workedHours.toFixed(1)} h worked · {row.siteVisits} site visit(s)
          </span>
          {row.workedOnHoliday > 0 && <Pill tone="warn">Worked {row.workedOnHoliday} holiday(s)</Pill>}
          {row.workedOnSunday > 0 && <Pill tone="warn">Worked {row.workedOnSunday} Sunday(s)</Pill>}
          {row.markedWhileOnLeave > 0 && <Pill tone="bad">{row.markedWhileOnLeave} day(s) marked while on leave</Pill>}
          {row.flagged > 0 && <Pill tone="bad">{row.flagged} geofence flag(s)</Pill>}
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
        <table className="tbl" style={{ fontSize: 'var(--fs-sm)' }}>
          <thead>
            <tr>
              <th>Date</th><th>Status</th><th>In</th><th>Out</th>
              <th className="num">Hours</th><th>Sites visited</th>
              <th className="num">On site</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {withActivity.map((d) => {
              const s = STATUS[d.status];
              return (
                <tr key={d.date}>
                  <td className="nowrap">
                    {fmtDate(d.date, { day: '2-digit', month: 'short' })}
                    <span className="subtle"> {DOW[d.dow]}</span>
                  </td>
                  <td><Pill tone={s.tone} dot>{s.label}</Pill></td>
                  <td>{d.in ? fmtTime(d.in) : <span className="subtle">—</span>}</td>
                  <td>{d.out ? fmtTime(d.out) : <span className="subtle">—</span>}</td>
                  <td className="num">{d.workedMinutes ? (d.workedMinutes / 60).toFixed(1) : <span className="subtle">—</span>}</td>
                  <td className="truncate" style={{ maxWidth: 240 }}>
                    {d.siteNames.length ? d.siteNames.join(', ') : <span className="subtle">—</span>}
                  </td>
                  <td className="num">{d.minutesOnSite ? (d.minutesOnSite / 60).toFixed(1) : <span className="subtle">—</span>}</td>
                  <td>
                    <div className="row wrap" style={{ gap: 3 }}>
                      {d.holiday && <Pill>{d.holiday}</Pill>}
                      {d.outOfGeofence > 0 && <Pill tone="bad">{d.outOfGeofence} outside geofence</Pill>}
                      {d.status === 'SITE_ONLY' && <Pill tone="warn">Day not marked</Pill>}
                      {d.onLeave && (d.status === 'PRESENT' || d.status === 'PRESENT_NO_CHECKOUT') &&
                        <Pill tone="bad">Marked during approved leave</Pill>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {row.noRecord > 0 && (
        <p className="xs subtle" style={{ marginTop: 'var(--s3)' }}>
          {row.noRecord} day(s) have no record at all — neither attendance, nor approved leave, nor a holiday.
          That may be an absence or simply a day nobody marked; worth checking before any deduction.
        </p>
      )}
    </div>
  );
}
