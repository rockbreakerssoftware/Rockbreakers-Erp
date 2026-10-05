import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, scopeFor } from '../lib/auth';
import { Button, Card, Empty, Pill, StatusPill, Avatar, Skeleton, useToast, Modal } from '../components/ui';
import Icon from '../components/Icon';
import JobForm from './JobForm';
import {
  dateKey, fmtDate, fmtTime, fmtDay, addDays, startOfWeek, startOfMonth, title,
} from '../lib/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Calendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const canSeeTeam = scopeFor(user, 'job', 'read') !== 'own';
  const canSchedule = scopeFor(user, 'job', 'create') != null;

  const [view, setView] = useState('month');            // month | agenda | timeline
  const [audience, setAudience] = useState('my');       // my | team
  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayPeek, setDayPeek] = useState(null);
  const [creating, setCreating] = useState(null);

  /* window of dates currently on screen */
  const range = useMemo(() => {
    if (view === 'month') {
      const first = startOfMonth(anchor);
      const from = startOfWeek(first);
      return { from, to: addDays(from, 41) };
    }
    if (view === 'timeline') {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 13) };
    }
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }, [anchor, view]);

  const effectiveAudience = canSeeTeam ? audience : 'my';

  useEffect(() => {
    setLoading(true);
    const params = {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      view: effectiveAudience === 'my' ? 'my' : 'team',
    };
    const calls = [api.get('/calendar', params)];
    if (view === 'timeline') calls.push(api.get('/calendar/resources'));
    Promise.all(calls)
      .then(([cal, people]) => setData({ ...cal, people: people || [] }))
      .catch((e) => toast.error(e))
      .finally(() => setLoading(false));
  }, [range.from, range.to, effectiveAudience, view]); // eslint-disable-line

  /* index everything by day for fast cell lookup */
  const byDay = useMemo(() => {
    const map = {};
    const add = (key, item) => { (map[key] ||= []).push(item); };

    for (const j of data?.jobs || []) {
      let d = new Date(j.scheduledStart);
      const end = new Date(j.scheduledEnd);
      d.setHours(0, 0, 0, 0);
      let guard = 0;
      // a multi-day installation occupies one cell per day
      while (d <= end && guard++ < 60) {
        add(dateKey(d), { kind: 'job', job: j });
        d = addDays(d, 1);
      }
    }
    for (const l of data?.leaves || []) {
      let d = new Date(l.from);
      const end = new Date(l.to);
      let guard = 0;
      while (d <= end && guard++ < 60) {
        add(dateKey(d), { kind: 'leave', leave: l });
        d = addDays(d, 1);
      }
    }
    for (const h of data?.holidays || []) add(h.date, { kind: 'holiday', holiday: h });
    return map;
  }, [data]);

  const today = dateKey();

  const shift = (n) => {
    if (view === 'month') {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + n);
      setAnchor(d);
    } else {
      setAnchor(addDays(anchor, n * (view === 'timeline' ? 14 : 7)));
    }
  };

  const heading = view === 'month'
    ? anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : `${fmtDate(range.from, { day: 'numeric', month: 'short' })} – ${fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const openJob = (id) => navigate(`/jobs/${id}`);

  const newJobOn = (day) => {
    if (!canSchedule) return;
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(17, 0, 0, 0);
    setCreating({ scheduledStart: start, scheduledEnd: end });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Work calendar</div>
          <div className="page-sub">
            {effectiveAudience === 'my' ? 'Your assigned jobs, leave and holidays' : 'Everyone you supervise, by day'}
          </div>
        </div>
        <div className="page-actions">
          {canSeeTeam && (
            <div className="btn-group">
              <button className={audience === 'my' ? 'on' : ''} onClick={() => setAudience('my')}>Mine</button>
              <button className={audience === 'team' ? 'on' : ''} onClick={() => setAudience('team')}>Team</button>
            </div>
          )}
          <div className="btn-group">
            <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
            <button className={view === 'agenda' ? 'on' : ''} onClick={() => setView('agenda')}>Week</button>
            {canSeeTeam && <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>}
          </div>
          {canSchedule && <Button variant="primary" icon="plus" onClick={() => setCreating({})}>Schedule job</Button>}
        </div>
      </div>

      <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
        <div className="row" style={{ gap: 'var(--s1)' }}>
          <Button size="sm" icon="chevronLeft" onClick={() => shift(-1)} aria-label="Previous" />
          <Button size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="sm" icon="chevronRight" onClick={() => shift(1)} aria-label="Next" />
          <span className="strong" style={{ marginLeft: 'var(--s2)' }}>{heading}</span>
          {loading && <span className="spinner" style={{ marginLeft: 8 }} />}
        </div>
        <div className="legend hide-mobile">
          <span><i style={{ background: 'var(--info)' }} /> Scheduled</span>
          <span><i style={{ background: 'var(--accent)' }} /> In progress</span>
          <span><i style={{ background: 'var(--warn)' }} /> On hold</span>
          <span><i style={{ background: 'var(--ok)' }} /> Done</span>
        </div>
      </div>

      {loading && !data ? (
        <Card><Skeleton rows={8} /></Card>
      ) : view === 'month' ? (
        <MonthGrid
          from={range.from} byDay={byDay} today={today} anchorMonth={anchor.getMonth()}
          onJob={openJob} onDay={setDayPeek} onEmptyDay={canSchedule ? newJobOn : null}
          showWho={effectiveAudience === 'team'}
        />
      ) : view === 'agenda' ? (
        <AgendaWeek from={range.from} byDay={byDay} today={today} onJob={openJob}
          showWho={effectiveAudience === 'team'} />
      ) : (
        <ResourceTimeline from={range.from} days={14} people={data?.people || []} jobs={data?.jobs || []}
          leaves={data?.leaves || []} today={today} onJob={openJob} />
      )}

      <Modal open={!!dayPeek} onClose={() => setDayPeek(null)} title={dayPeek ? fmtDate(dayPeek) : ''}>
        <div className="col" style={{ gap: 'var(--s2)' }}>
          {(byDay[dayPeek] || []).map((e, i) =>
            e.kind === 'job' ? (
              <button key={i} className="job-row" onClick={() => { setDayPeek(null); openJob(e.job._id); }}>
                <span className={`bar ${e.job.status}`} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="cell-main truncate">{e.job.title}</div>
                  <div className="cell-sub truncate">
                    {e.job.site?.name} · {fmtTime(e.job.scheduledStart)}
                    {e.job.assignments?.length > 0 && ` · ${e.job.assignments.map((a) => a.user?.name).filter(Boolean).join(', ')}`}
                  </div>
                </div>
                <StatusPill status={e.job.status} />
              </button>
            ) : e.kind === 'leave' ? (
              <div key={i} className="row small muted" style={{ padding: 'var(--s2)' }}>
                <Icon name="user" size={14} /> {e.leave.user?.name} on {title(e.leave.type)} leave
              </div>
            ) : (
              <div key={i} className="row small" style={{ padding: 'var(--s2)', color: 'var(--bad)' }}>
                <Icon name="flag" size={14} /> {e.holiday.name}
              </div>
            ))}
          {!(byDay[dayPeek] || []).length && <Empty icon="calendar" title="Nothing on this day" />}
        </div>
      </Modal>

      {creating && (
        <JobForm
          initial={creating}
          onClose={() => setCreating(null)}
          onSaved={(job) => { setCreating(null); navigate(`/jobs/${job._id}`); }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ month */

function MonthGrid({ from, byDay, today, anchorMonth, onJob, onDay, onEmptyDay, showWho }) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="cal">
      <div className="cal-head">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="cal-grid">
        {cells.map((d) => {
          const key = dateKey(d);
          const items = byDay[key] || [];
          const jobs = items.filter((i) => i.kind === 'job');
          const holiday = items.find((i) => i.kind === 'holiday');
          const leaves = items.filter((i) => i.kind === 'leave');
          const out = d.getMonth() !== anchorMonth;
          const isToday = key === today;

          return (
            <div
              key={key}
              className={`cal-cell ${out ? 'out' : ''} ${isToday ? 'today' : ''} ${onEmptyDay ? 'clickable' : ''}`}
              onClick={(e) => { if (e.target.closest('button')) return; onEmptyDay?.(d); }}
            >
              <div className="cal-date">
                {isToday ? <span className="today-dot">{d.getDate()}</span> : d.getDate()}
              </div>
              {holiday && <div className="cal-holiday truncate">{holiday.holiday.name}</div>}
              {jobs.slice(0, 3).map((i, n) => (
                <button key={n} className={`cal-chip ${i.job.status}`}
                  onClick={(e) => { e.stopPropagation(); onJob(i.job._id); }}>
                  <span className="t">
                    {showWho && i.job.assignments?.[0]?.user?.name
                      ? `${i.job.assignments[0].user.name.split(' ')[0]} · `
                      : ''}
                    {i.job.title}
                  </span>
                </button>
              ))}
              {leaves.slice(0, 1).map((i, n) => (
                <span key={`l${n}`} className="cal-chip leave">
                  <span className="t">{i.leave.user?.name?.split(' ')[0]} — leave</span>
                </span>
              ))}
              {jobs.length > 3 && (
                <button className="cal-more" onClick={(e) => { e.stopPropagation(); onDay(key); }}>
                  +{jobs.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- agenda */

function AgendaWeek({ from, byDay, today, onJob, showWho }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const any = days.some((d) => (byDay[dateKey(d)] || []).length);

  if (!any) {
    return (
      <Card>
        <Empty icon="calendar" title="Nothing scheduled this week"
          text="Jobs assigned to you in this week will show here, grouped by day." />
      </Card>
    );
  }

  return (
    <div className="cal">
      {days.map((d) => {
        const key = dateKey(d);
        const items = byDay[key] || [];
        const jobs = items.filter((i) => i.kind === 'job');
        const holiday = items.find((i) => i.kind === 'holiday');
        return (
          <div className="agenda-day" key={key}>
            <div className={`agenda-head ${key === today ? 'today' : ''}`}>
              <span className="agenda-date">{fmtDay(d)}</span>
              {key === today && <Pill tone="accent">Today</Pill>}
              {holiday && <Pill tone="bad">{holiday.holiday.name}</Pill>}
              <span className="right small subtle">{jobs.length ? `${jobs.length} job${jobs.length > 1 ? 's' : ''}` : 'Free'}</span>
            </div>
            {jobs.length > 0 && (
              <div className="agenda-body">
                {jobs.map((i, n) => (
                  <button key={n} className="job-row" onClick={() => onJob(i.job._id)}>
                    <span className={`bar ${i.job.status}`} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 'var(--s2)' }}>
                        <span className="cell-main truncate">{i.job.title}</span>
                        <Pill>{title(i.job.type)}</Pill>
                      </div>
                      <div className="cell-sub truncate">
                        {i.job.site?.name} · {fmtTime(i.job.scheduledStart)}–{fmtTime(i.job.scheduledEnd)}
                        {showWho && i.job.assignments?.length
                          ? ` · ${i.job.assignments.map((a) => a.user?.name).filter(Boolean).join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <StatusPill status={i.job.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- timeline */

/**
 * One row per engineer with jobs as bars across the dates. This is the only
 * view where a double-booking is obvious at a glance, which is why it is
 * the view a manager schedules from.
 */
function ResourceTimeline({ from, days, people, jobs, leaves, today, onJob }) {
  const cols = Array.from({ length: days }, (_, i) => addDays(from, i));
  const dayMs = 864e5;
  const startMs = new Date(dateKey(from)).getTime();

  const rowsFor = (personId) =>
    jobs.filter((j) => j.assignments?.some((a) => String(a.user?._id || a.user) === String(personId)));

  if (!people.length) {
    return <Card><Empty icon="users" title="No team members" text="Nobody reports to you yet." /></Card>;
  }

  return (
    <div className="timeline-wrap">
      <div className="tl">
        <div className="tl-head">
          <div className="tl-name-col">Engineer</div>
          {cols.map((d) => (
            <div key={dateKey(d)} className={`tl-day ${dateKey(d) === today ? 'today' : ''}`}>
              <span className="dow">{DOW[d.getDay()]}</span>
              {d.getDate()}
            </div>
          ))}
        </div>

        {people.map((p) => {
          const mine = rowsFor(p._id);
          const onLeave = leaves.filter((l) => String(l.user?._id || l.user) === String(p._id));
          return (
            <div className="tl-row" key={p._id}>
              <div className="tl-person">
                <Avatar name={p.name} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <div className="small truncate">{p.name}</div>
                  <div className="xs subtle truncate">{p.role?.name || p.designation}</div>
                </div>
              </div>
              <div className="tl-track">
                {cols.map((d) => (
                  <div key={dateKey(d)} className={`tl-slot ${dateKey(d) === today ? 'today' : ''}`} />
                ))}
                {mine.map((j) => {
                  const s = Math.max(0, Math.round((new Date(dateKey(j.scheduledStart)).getTime() - startMs) / dayMs));
                  const e = Math.min(days - 1, Math.round((new Date(dateKey(j.scheduledEnd)).getTime() - startMs) / dayMs));
                  if (e < 0 || s > days - 1) return null;
                  const span = e - s + 1;
                  // a bar overlapping another on the same row is the double-booking signal
                  const clash = mine.some((o) =>
                    o._id !== j._id &&
                    new Date(o.scheduledStart) <= new Date(j.scheduledEnd) &&
                    new Date(o.scheduledEnd) >= new Date(j.scheduledStart));
                  return (
                    <button
                      key={j._id}
                      className={`tl-bar ${j.status} ${clash ? 'conflict' : ''}`}
                      title={`${j.title} — ${j.site?.name || ''}${clash ? ' (overlapping assignment)' : ''}`}
                      style={{
                        left: `calc(${(s / days) * 100}% + 2px)`,
                        width: `calc(${(span / days) * 100}% - 4px)`,
                      }}
                      onClick={() => onJob(j._id)}
                    >
                      {j.title}
                    </button>
                  );
                })}
                {onLeave.map((l, i) => {
                  const s = Math.max(0, Math.round((new Date(l.from).getTime() - startMs) / dayMs));
                  const e = Math.min(days - 1, Math.round((new Date(l.to).getTime() - startMs) / dayMs));
                  if (e < 0 || s > days - 1) return null;
                  return (
                    <span key={`lv${i}`} className="tl-bar"
                      style={{
                        left: `calc(${(s / days) * 100}% + 2px)`,
                        width: `calc(${((e - s + 1) / days) * 100}% - 4px)`,
                        top: 'auto', bottom: 3, height: 10, fontSize: 9,
                        background: 'var(--neutral-soft)', color: 'var(--text-subtle)', boxShadow: 'none',
                      }}>
                      leave
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
