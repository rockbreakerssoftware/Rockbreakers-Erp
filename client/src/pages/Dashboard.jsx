import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Stat, StatSkeleton, Empty, Button, Pill, StatusPill, Avatar, AvatarStack, Banner, useToast } from '../components/ui';
import Icon from '../components/Icon';
import { fmtTime, fmtRange, title, relative, money } from '../lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">{greeting}, {user.name.split(' ')[0]}</div>
          <div className="page-sub">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
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

      <div className="grid grid-4" style={{ marginBottom: 'var(--s5)' }}>
        {cards.map((c) => <Stat key={c.key} label={c.label} value={c.value} hint={c.hint} tone={c.tone} />)}
      </div>

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
