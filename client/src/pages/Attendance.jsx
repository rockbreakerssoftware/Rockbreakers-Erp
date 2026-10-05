import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { useCan } from '../lib/auth';
import {
  Card, Button, Banner, Empty, Skeleton, Pill, Avatar, Modal, Tabs, Table,
  Lightbox, ConfirmModal, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import SelfieCapture from '../components/SelfieCapture';
import Map from '../components/Map';
import { fmtTime, fmtDateTime, hours, title, dateKey, relative } from '../lib/format';
import { formatDistance } from '../lib/geo';

export default function Attendance() {
  const can = useCan();
  const toast = useToast();
  const navigate = useNavigate();

  const canReview = can('attendance', 'approve');
  const [tab, setTab] = useState('me');
  const [today, setToday] = useState(null);
  const [myCheckIns, setMyCheckIns] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [marking, setMarking] = useState(null); // 'in' | 'out'
  const [lightbox, setLightbox] = useState(null);

  const loadMine = () => {
    Promise.all([api.get('/calendar/today'), api.get('/attendance/site', { date: dateKey() })])
      .then(([day, checks]) => { setToday(day); setMyCheckIns(checks); setJobs(day.jobs); })
      .catch((e) => toast.error(e));
  };

  useEffect(loadMine, []); // eslint-disable-line

  const mark = async (payload) => {
    try {
      await api.post(`/attendance/${marking === 'in' ? 'check-in' : 'check-out'}`, payload);
      toast.ok(marking === 'in' ? 'Attendance marked for today' : 'Checked out for the day');
      setMarking(null);
      loadMine();
    } catch (e) { toast.error(e); }
  };

  const att = today?.attendance;
  const markedIn = !!att?.checkIn?.at;
  const markedOut = !!att?.checkOut?.at;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Attendance</div>
          <div className="page-sub">
            Your day, and the proof that you were on each site
          </div>
        </div>
      </div>

      {canReview && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Tabs
            tabs={[{ key: 'me', label: 'My attendance' }, { key: 'team', label: 'Team' }, { key: 'flagged', label: 'Flagged check-ins' }]}
            value={tab} onChange={setTab}
          />
        </div>
      )}

      {tab === 'me' && (
        !today ? <Card><Skeleton rows={5} /></Card> : (
          <>
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <Card title="Today" subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}>
                {!markedIn ? (
                  <>
                    <Empty icon="clock" title="Attendance not marked"
                      text="Take a selfie to start your day. Your location is recorded with it." />
                    <Button variant="primary" className="block" icon="camera" onClick={() => setMarking('in')}>
                      Mark attendance
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="row" style={{ gap: 'var(--s4)', alignItems: 'flex-start' }}>
                      {att.checkIn.media && (
                        <button className="shot" style={{ width: 84, flex: '0 0 84px' }}
                          onClick={() => setLightbox({ src: mediaUrl(att.checkIn.media), caption: `Day start — ${fmtTime(att.checkIn.at)}` })}>
                          <img src={mediaUrl(att.checkIn.media)} alt="Attendance selfie" />
                        </button>
                      )}
                      <div className="grow">
                        <dl className="geo-readout">
                          <div><dt>Started</dt><dd>{fmtTime(att.checkIn.at)}</dd></div>
                          <div><dt>Ended</dt><dd>{markedOut ? fmtTime(att.checkOut.at) : '— still working'}</dd></div>
                          <div><dt>Accuracy</dt><dd>±{att.checkIn.accuracy} m</dd></div>
                          <div><dt>Worked</dt><dd>{att.workedMinutes ? hours(att.workedMinutes) : '—'}</dd></div>
                        </dl>
                        {att.checkIn.address && <div className="xs subtle" style={{ marginTop: 6 }}>{att.checkIn.address}</div>}
                      </div>
                    </div>
                    {!markedOut && (
                      <Button className="block" icon="camera" style={{ marginTop: 'var(--s4)' }} onClick={() => setMarking('out')}>
                        Check out for the day
                      </Button>
                    )}
                    {markedOut && (
                      <div style={{ marginTop: 'var(--s4)' }}>
                        <Banner tone="ok" icon="check">Your day is recorded — {hours(att.workedMinutes)} worked.</Banner>
                      </div>
                    )}
                  </>
                )}
              </Card>

              <Card title="Today's sites" subtitle="One check-in per site, separate from your daily attendance">
                {jobs?.length ? (
                  <div className="col" style={{ gap: 'var(--s2)' }}>
                    {jobs.map((j) => {
                      const c = myCheckIns.find((x) => String(x.job) === String(j._id));
                      return (
                        <button key={j._id} className="job-row" onClick={() => navigate(`/jobs/${j._id}`)}>
                          <span className={`bar ${j.status}`} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="cell-main truncate">{j.site?.name}</div>
                            <div className="cell-sub truncate">{j.title}</div>
                          </div>
                          {c?.out?.at ? <Pill tone="ok" dot>{hours(c.minutesOnSite)}</Pill>
                            : c?.in?.at ? <Pill tone="accent" dot>On site</Pill>
                            : <Pill dot>Check in</Pill>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty icon="map" title="No sites scheduled today"
                    text="Site check-ins are made against a scheduled job." />
                )}
              </Card>
            </div>

            <Card title="My recent site check-ins">
              {myCheckIns.length ? (
                <SiteCheckInList items={myCheckIns} onPhoto={setLightbox} />
              ) : (
                <Empty icon="camera" title="No site check-ins yet"
                  text="Open a job from your calendar and check in when you reach the site." />
              )}
            </Card>
          </>
        )
      )}

      {tab === 'team' && <TeamAttendance onPhoto={setLightbox} />}
      {tab === 'flagged' && <FlaggedReview onPhoto={setLightbox} />}

      <Modal open={!!marking} onClose={() => setMarking(null)}
        title={marking === 'in' ? 'Mark attendance' : 'Check out for the day'}>
        <SelfieCapture onCapture={mark} actionLabel={marking === 'in' ? 'Mark attendance' : 'Check out'} />
      </Modal>

      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

function SiteCheckInList({ items, onPhoto, showUser }) {
  return (
    <div className="col" style={{ gap: 'var(--s4)' }}>
      {items.map((c) => (
        <div key={c._id} className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
          {c.in?.media && (
            <button className="shot" style={{ width: 64, flex: '0 0 64px' }}
              onClick={() => onPhoto({ src: mediaUrl(c.in.media), caption: `${c.site?.name} — ${fmtDateTime(c.in.at)}` })}>
              <img src={mediaUrl(c.in.media)} alt="Check-in selfie" />
            </button>
          )}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              {showUser && <span className="strong">{c.user?.name}</span>}
              <span className="cell-main">{c.site?.name}</span>
              {c.outOfGeofence ? <Pill tone="bad" dot>{formatDistance(c.distanceMeters)} away</Pill>
                : <Pill tone="ok" dot>Verified</Pill>}
            </div>
            <div className="cell-sub">
              {c.date} · {fmtTime(c.in?.at)}{c.out?.at ? ` – ${fmtTime(c.out.at)}` : ' — still on site'}
              {c.minutesOnSite ? ` · ${hours(c.minutesOnSite)}` : ''}
            </div>
            {c.job?.title && <div className="xs subtle truncate">{c.job.title}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamAttendance({ onPhoto }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [date, setDate] = useState(dateKey());

  useEffect(() => {
    setRows(null);
    api.get('/attendance', { from: date, to: date }).then(setRows).catch((e) => toast.error(e));
  }, [date]); // eslint-disable-line

  const columns = [
    { key: 'user', label: 'Employee', render: (r) => (
      <div className="row" style={{ gap: 'var(--s2)' }}>
        <Avatar name={r.user?.name} size="sm" />
        <div style={{ minWidth: 0 }}>
          <div className="cell-main truncate">{r.user?.name}</div>
          <div className="cell-sub truncate">{r.user?.designation}</div>
        </div>
      </div>
    ) },
    { key: 'in', label: 'Started', render: (r) => fmtTime(r.checkIn?.at) },
    { key: 'out', label: 'Ended', render: (r) => (r.checkOut?.at ? fmtTime(r.checkOut.at) : <span className="muted">Working</span>) },
    { key: 'worked', label: 'Worked', align: 'right', render: (r) => (r.workedMinutes ? hours(r.workedMinutes) : '—') },
    { key: 'flags', label: 'Flags', render: (r) => (
      r.checkIn?.flags?.length
        ? <div className="row" style={{ gap: 4 }}>{r.checkIn.flags.map((f) => <Pill key={f} tone="warn">{title(f)}</Pill>)}</div>
        : <Pill tone="ok" dot>Clean</Pill>
    ) },
    { key: 'photo', label: 'Selfie', render: (r) => (
      r.checkIn?.media
        ? <button className="btn sm ghost" onClick={() => onPhoto({ src: mediaUrl(r.checkIn.media), caption: `${r.user?.name} — ${fmtDateTime(r.checkIn.at)}` })}>
            <Icon name="image" size={14} /> View
          </button>
        : '—'
    ) },
  ];

  return (
    <Card
      title="Team attendance"
      actions={<input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />}
    >
      {!rows ? <Skeleton rows={5} /> : (
        <Table columns={columns} rows={rows}
          empty={<Empty icon="users" title="Nobody marked attendance on this date"
            text="Attendance is marked by each person from their own phone." />} />
      )}
    </Card>
  );
}

function FlaggedReview({ onPhoto }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [acting, setActing] = useState(null);

  const load = () => {
    setRows(null);
    api.get('/attendance/site', { flagged: 'true' }).then(setRows).catch((e) => toast.error(e));
  };
  useEffect(load, []); // eslint-disable-line

  const review = async (note) => {
    try {
      await api.patch(`/attendance/site/${acting.record._id}/review`, { status: acting.status, note });
      toast.ok(`Check-in ${acting.status === 'APPROVED' ? 'approved' : 'rejected'}`);
      setActing(null);
      load();
    } catch (e) { toast.error(e); }
  };

  const pending = rows?.filter((r) => r.reviewStatus === 'PENDING') || [];

  return (
    <>
      <Card title="Check-ins outside the site boundary"
        subtitle="GPS drifts at quarry sites — these are flagged for a human to judge, never auto-rejected">
        {!rows ? <Skeleton rows={4} /> : pending.length ? (
          <div className="col" style={{ gap: 'var(--s5)' }}>
            {pending.map((c) => (
              <div key={c._id}>
                <div className="row" style={{ gap: 'var(--s4)', alignItems: 'flex-start' }}>
                  {c.in?.media && (
                    <button className="shot" style={{ width: 80, flex: '0 0 80px' }}
                      onClick={() => onPhoto({ src: mediaUrl(c.in.media), caption: `${c.user?.name} — ${fmtDateTime(c.in.at)}` })}>
                      <img src={mediaUrl(c.in.media)} alt="Check-in selfie" />
                    </button>
                  )}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                      <span className="strong">{c.user?.name}</span>
                      <Pill tone="bad" dot>{formatDistance(c.distanceMeters)} from site centre</Pill>
                    </div>
                    <div className="small muted">
                      {c.site?.name} · {c.date} {fmtTime(c.in?.at)} · boundary {c.site?.geofenceRadius} m
                    </div>
                    {c.in?.address && <div className="xs subtle">{c.in.address}</div>}
                    <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
                      <Button size="sm" variant="primary" icon="check"
                        onClick={() => setActing({ record: c, status: 'APPROVED' })}>Accept</Button>
                      <Button size="sm" variant="danger"
                        onClick={() => setActing({ record: c, status: 'REJECTED' })}>Reject</Button>
                    </div>
                  </div>
                </div>
                {c.site?.location?.lat && c.in?.lat && (
                  <div style={{ marginTop: 'var(--s3)' }}>
                    <Map size="sm" fit
                      circle={{ ...c.site.location, radius: c.site.geofenceRadius }}
                      markers={[
                        { ...c.site.location, label: 'S', popup: c.site.name },
                        { lat: c.in.lat, lng: c.in.lng, color: '#b91c1c', label: 'E', popup: `${c.user?.name} checked in here` },
                      ]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="check" title="Nothing waiting for review"
            text="Every site check-in has been inside its boundary, or already reviewed." />
        )}
      </Card>

      <ConfirmModal
        open={!!acting} onClose={() => setActing(null)} onConfirm={review}
        title={acting?.status === 'APPROVED' ? 'Accept this check-in' : 'Reject this check-in'}
        confirmLabel={acting?.status === 'APPROVED' ? 'Accept' : 'Reject'}
        danger={acting?.status === 'REJECTED'}
        requireReason={acting?.status === 'REJECTED'}
        message={acting?.status === 'APPROVED'
          ? 'The engineer was where they say they were. This is recorded in the activity log.'
          : 'Give the reason — the engineer and the activity log will both carry it.'}
      />
    </>
  );
}
