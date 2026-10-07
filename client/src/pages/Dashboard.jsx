import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Stat, StatSkeleton, Empty, Button, Pill, StatusPill, Avatar, AvatarStack, Banner, useToast } from '../components/ui';
import Icon from '../components/Icon';
import { fmtTime, fmtRange, title, relative, money } from '../lib/format';

const ICONS = {
  my_today: 'calendar', team_today: 'users', my_open: 'briefcase',
  attendance: 'clock', week: 'calendar', overdue: 'alert', on_hold: 'clock',
  flagged: 'mapPin', unmarked: 'clock', expenses: 'receipt',
  requirements: 'box', people: 'users', sites: 'map', my_expenses: 'receipt',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);


  if (error) return <Banner tone="bad" icon="alert">{error}</Banner>;

  if (!data) {
    return (
      <>
        <div className="page-head"><div><div className="page-title">Dashboard</div></div></div>
        <StatSkeleton />
      </>
    );
  }

  const { sections, cards } = data;
  const myDay = sections.myDay || {};
  const attendanceDone = !!myDay.attendance?.checkIn?.at;

  // Thirteen identical tiles told the eye nothing. The same payload is
  // grouped into three tiers: what this role opened the page for, what is
  // waiting on them, and context that should recede.
  const LEAD = ['my_today', 'team_today'];
  const REFERENCE = ['people', 'sites', 'week', 'my_open', 'on_hold'];

  const shown = cards.filter((c) => {
    // The banner above already states this and carries the action.
    if (c.key === 'attendance' && !attendanceDone) return false;
    return true;
  });

  const lead = shown.filter((c) => LEAD.includes(c.key));
  const rest = shown.filter((c) => !LEAD.includes(c.key));

  // Nothing at zero is waiting on anyone. "Flagged check-ins: 0" under a
  // heading that says Needs attention is noise, so it drops to reference.
  const needsAction = (c) => Number(c.value) > 0;
  const attention = rest.filter((c) => !REFERENCE.includes(c.key) && needsAction(c));
  const reference = rest.filter((c) => REFERENCE.includes(c.key) || !needsAction(c));

  // A zero is not an achievement. Colour is reserved for a number that wants
  // someone to do something about it.
  const tile = (c) => ({
    label: c.label,
    value: c.value,
    hint: c.hint,
    tone: Number(c.value) === 0 || c.tone === 'ok' ? '' : c.tone,
    icon: ICONS[c.key],
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Today</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{user.role?.name}
          </div>
        </div>
        <div className="page-actions">
          <Button icon="calendar" onClick={() => navigate('/calendar')}>Work calendar</Button>
        </div>
      </div>

      {!attendanceDone && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="clock"
            actions={<Button size="sm" variant="primary" onClick={() => navigate('/attendance')}>Mark attendance</Button>}>
            You have not marked attendance today.
          </Banner>
        </div>
      )}

      {lead.length > 0 && (
        <div className="grid grid-lead" style={{ marginBottom: 'var(--sp-5)' }}>
          {lead.map((c) => <Stat key={c.key} tier="lead" {...tile(c)} />)}
        </div>
      )}

      {attention.length > 0 && (
        <>
          <h2 className="section-label">Needs attention</h2>
          <div className="grid grid-tiles" style={{ marginBottom: 'var(--sp-5)' }}>
            {attention.map((c) => <Stat key={c.key} {...tile(c)} />)}
          </div>
        </>
      )}

      {reference.length > 0 && (
        <>
          <h2 className="section-label">Reference</h2>
          <div className="grid grid-tiles" style={{ marginBottom: 'var(--sp-5)' }}>
            {reference.map((c) => <Stat key={c.key} tier="quiet" {...tile(c)} />)}
          </div>
        </>
      )}

      <div className="grid" style={{ gridTemplateColumns: sections.team ? '1.3fr 1fr' : '1fr', alignItems: 'start' }}>
        <Card
          title="My day"
          subtitle={myDay.jobs?.length ? `${myDay.jobs.length} job${myDay.jobs.length > 1 ? 's' : ''} scheduled` : undefined}
          actions={<Link to="/calendar" className="btn sm ghost">Open calendar</Link>}
          bodyClass={myDay.jobs?.length ? 'tight' : ''}
        >
          {myDay.jobs?.length ? (
            <div className="col" style={{ gap: 'var(--s2)' }}>
              {myDay.jobs.map((j) => {
                const checked = myDay.checkIns?.find((c) => String(c.job) === String(j._id));
                return (
                  <button key={j._id} className="job-row" onClick={() => navigate(`/jobs/${j._id}`)}>
                    <span className={`bar ${j.status}`} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 'var(--s2)' }}>
                        <span className="cell-main truncate">{j.title}</span>
                        <Pill>{title(j.type)}</Pill>
                      </div>
                      <div className="cell-sub truncate">
                        {j.site?.name} · {fmtTime(j.scheduledStart)}
                      </div>
                    </div>
                    {checked?.out?.at ? <Pill tone="ok" dot>Done</Pill>
                      : checked?.in?.at ? <Pill tone="accent" dot>On site</Pill>
                      : <Pill dot>Not started</Pill>}
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty icon="calendar" title="No jobs scheduled today"
              text="When a manager assigns you a visit or installation, it appears here and on your calendar." />
          )}
        </Card>

        {sections.team && (
          <div>
            <Card title="Flagged check-ins" subtitle="Outside the site boundary — needs your review"
              actions={<Link to="/attendance" className="btn sm ghost">All attendance</Link>}>
              {sections.team.flagged?.length ? (
                <div className="col" style={{ gap: 'var(--s3)' }}>
                  {sections.team.flagged.map((f) => (
                    <div className="row" key={f._id} style={{ gap: 'var(--s3)' }}>
                      <Avatar name={f.user?.name} size="sm" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="small truncate"><span className="strong">{f.user?.name}</span> at {f.site?.name}</div>
                        <div className="xs subtle truncate">
                          {f.distanceMeters} m away · {relative(f.createdAt)}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => navigate(`/jobs/${f.job?._id || f.job}`)}>Review</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon="check" title="Nothing flagged" text="Every check-in today was inside its site boundary." />
              )}
            </Card>

            <Card title="Team today" subtitle={`${sections.team.todayJobs?.length || 0} jobs across the team`}>
              {sections.team.todayJobs?.length ? (
                <div className="col" style={{ gap: 'var(--s2)' }}>
                  {sections.team.todayJobs.slice(0, 6).map((j) => (
                    <div key={j._id} className="row" style={{ gap: 'var(--s3)' }}>
                      <AvatarStack people={j.assignments?.map((a) => a.user) || []} max={3} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="small truncate">{j.title}</div>
                        <div className="xs subtle truncate">{j.site?.name}</div>
                      </div>
                      <StatusPill status={j.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty icon="briefcase" title="Nothing scheduled" text="No team jobs are scheduled for today." />
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
