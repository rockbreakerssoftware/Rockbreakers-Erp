import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { useAuth, useCan } from '../lib/auth';
import {
  Card, Button, Pill, StatusPill, Avatar, Banner, Empty, Skeleton, Tabs, Modal, Field,
  Input, Select, Textarea, ConfirmModal, Lightbox, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import SelfieCapture from '../components/SelfieCapture';
import Map from '../components/Map';
import JobForm from './JobForm';
import {
  fmtRange, fmtDateTime, fmtTime, title, hours, NEXT_STATUS, money,
  dateKey, daysBetween, priorityTone, relative,
} from '../lib/format';
import { formatDistance } from '../lib/geo';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const can = useCan();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [checkIns, setCheckIns] = useState([]);
  const [captures, setCaptures] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState(null);

  const [checking, setChecking] = useState(null);   // 'in' | 'out'
  const [capturing, setCapturing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusTo, setStatusTo] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      api.get(`/jobs/${id}`),
      api.get('/attendance/site', { job: id }),
      api.get('/captures', { job: id }),
      api.get('/requirements', { job: id }).catch(() => []),
    ])
      .then(([j, c, p, r]) => { setJob(j); setCheckIns(c); setCaptures(p); setRequirements(r); })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (job && can('job', 'assign')) {
      api.get(`/jobs/${id}/conflicts`).then(setConflicts).catch(() => {});
    }
  }, [job?._id]); // eslint-disable-line

  if (error) return <Banner tone="bad" icon="alert">{error}</Banner>;
  if (!job) return <Card><Skeleton rows={8} /></Card>;

  const mine = job.assignments?.find((a) => String(a.user?._id || a.user) === String(user._id));
  const isLead = mine?.roleOnJob === 'LEAD';
  const today = dateKey();
  const myCheckIn = checkIns.find((c) => String(c.user?._id || c.user) === String(user._id) && c.date === today);
  const onSite = myCheckIn?.in?.at && !myCheckIn?.out?.at;
  const closed = ['CLOSED', 'CANCELLED'].includes(job.status);
  const days = daysBetween(job.scheduledStart, job.scheduledEnd);

  const doCheckIn = async (payload) => {
    try {
      await api.post(`/attendance/site/${id}/check-in`, payload);
      toast.ok('Checked in — your location and photo are recorded');
      setChecking(null);
      load();
    } catch (e) { toast.error(e); }
  };

  const doCheckOut = async (payload) => {
    try {
      await api.post(`/attendance/site/${id}/check-out`, payload);
      toast.ok('Checked out');
      setChecking(null);
      load();
    } catch (e) { toast.error(e); }
  };

  const changeStatus = async (note) => {
    try {
      await api.patch(`/jobs/${id}/status`, { status: statusTo, note });
      toast.ok(`Job moved to ${title(statusTo)}`);
      setStatusTo(null);
      load();
    } catch (e) { toast.error(e); }
  };

  const respond = async (action) => {
    try {
      await api.post(`/jobs/${id}/respond`, { action });
      toast.ok(action === 'accept' ? 'Job accepted' : 'Reschedule requested');
      load();
    } catch (e) { toast.error(e); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'crew', label: 'Crew', count: job.assignments?.length || 0 },
    { key: 'presence', label: 'Site check-ins', count: checkIns.length },
    { key: 'photos', label: 'Photos', count: captures.length },
    { key: 'parts', label: 'Requirements', count: requirements.length },
  ];

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <button className="btn sm ghost" onClick={() => navigate(-1)} style={{ marginBottom: 6, marginLeft: -8 }}>
            <Icon name="chevronLeft" size={14} /> Back
          </button>
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            <h1 className="page-title">{job.title}</h1>
            <StatusPill status={job.status} />
            {job.priority !== 'NORMAL' && <Pill tone={priorityTone(job.priority)} dot>{title(job.priority)}</Pill>}
          </div>
          <div className="page-sub">
            {title(job.type)} · {job.site?.name} · {fmtRange(job.scheduledStart, job.scheduledEnd)}
            {days > 1 && ` · ${days} days`}
          </div>
        </div>

        <div className="page-actions">
          {mine && mine.status === 'ASSIGNED' && !closed && (
            <>
              <Button onClick={() => respond('reschedule')}>Request reschedule</Button>
              <Button variant="primary" icon="check" onClick={() => respond('accept')}>Accept</Button>
            </>
          )}
          {mine && !closed && (onSite
            ? <Button icon="camera" onClick={() => setChecking('out')}>Check out of site</Button>
            : !myCheckIn && <Button variant="primary" icon="camera" onClick={() => setChecking('in')}>Check in at site</Button>)}
          {can('job', 'update') && !closed && (
            <Button icon="edit" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
      </div>

      {job.status === 'ON_HOLD' && job.holdReason && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="alert">On hold — {job.holdReason}</Banner>
        </div>
      )}

      {conflicts.length > 0 && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="alert">
            <strong>Scheduling conflicts</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {conflicts.map((c, i) => <li key={i} className="small">{c.userName}: {c.message}</li>)}
            </ul>
          </Banner>
        </div>
      )}

      <div style={{ marginBottom: 'var(--s4)' }}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
          <div>
            <Card title="Details">
              <dl className="kv">
                <dt>Customer</dt><dd>{job.customer?.name || '—'}</dd>
                <dt>Site</dt><dd>{job.site?.name}{job.site?.address ? `, ${job.site.address}` : ''}</dd>
                <dt>Type</dt><dd>{title(job.type)}</dd>
                <dt>Priority</dt><dd>{title(job.priority)}</dd>
                <dt>Scheduled</dt><dd>{fmtRange(job.scheduledStart, job.scheduledEnd)}</dd>
                <dt>Created by</dt><dd>{job.createdBy?.name || '—'}</dd>
                {job.closedAt && <><dt>Closed</dt><dd>{fmtDateTime(job.closedAt)}</dd></>}
              </dl>
              {job.description && (
                <>
                  <hr className="divider" />
                  <div className="label-xs" style={{ marginBottom: 4 }}>Description</div>
                  <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
                </>
              )}
              {job.completionNotes && (
                <>
                  <hr className="divider" />
                  <div className="label-xs" style={{ marginBottom: 4 }}>Completion notes</div>
                  <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{job.completionNotes}</p>
                </>
              )}
            </Card>

            {can('job', 'update') && !closed && NEXT_STATUS[job.status]?.length > 0 && (
              <Card title="Move this job">
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  {NEXT_STATUS[job.status].map((s) => (
                    <Button key={s} variant={s === 'CLOSED' || s === 'WORK_DONE' ? 'primary' : ''}
                      onClick={() => setStatusTo(s)}>
                      {title(s)}
                    </Button>
                  ))}
                </div>
                {job.status === 'WORK_DONE' && !isLead && (
                  <p className="xs subtle" style={{ marginTop: 'var(--s3)' }}>
                    The lead engineer normally closes the job and signs off the completion report.
                  </p>
                )}
              </Card>
            )}
          </div>

          <Card title="Location" bodyClass="tight">
            {job.site?.location?.lat ? (
              <>
                <Map
                  size="sm"
                  center={job.site.location}
                  circle={{ ...job.site.location, radius: job.site.geofenceRadius }}
                  markers={[
                    { ...job.site.location, label: 'S', popup: job.site.name },
                    ...checkIns.filter((c) => c.in?.lat).map((c) => ({
                      lat: c.in.lat, lng: c.in.lng, color: c.outOfGeofence ? '#b91c1c' : '#15803d',
                      popup: `${c.user?.name || 'Engineer'} — ${fmtTime(c.in.at)}`,
                    })),
                  ]}
                  fit={checkIns.length > 0}
                />
                <div className="small muted" style={{ padding: 'var(--s3) var(--s1) 0' }}>
                  Geofence radius {job.site.geofenceRadius} m. Green pins are check-ins inside it, red ones outside.
                </div>
              </>
            ) : (
              <Empty icon="map" title="No coordinates on this site"
                text="Add a location to the site record so check-ins can be verified against it." />
            )}
          </Card>
        </div>
      )}

      {tab === 'crew' && (
        <Card title="Assigned crew" subtitle={`${job.assignments?.length || 0} assigned · the lead closes the job`}>
          {job.assignments?.length ? (
            <div>
              {job.assignments.map((a) => {
                const theirCheckIns = checkIns.filter((c) => String(c.user?._id || c.user) === String(a.user?._id || a.user));
                return (
                  <div className="crew-row" key={a.user?._id || a.user}>
                    <Avatar name={a.user?.name} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 'var(--s2)' }}>
                        <span className="cell-main truncate">{a.user?.name}</span>
                        {a.roleOnJob === 'LEAD' && <Pill tone="accent">Lead</Pill>}
                        {a.roleOnJob === 'TRAINEE' && <Pill>Trainee</Pill>}
                      </div>
                      <div className="cell-sub">
                        {a.user?.designation || '—'}
                        {theirCheckIns.length > 0 && ` · ${theirCheckIns.length} site check-in${theirCheckIns.length > 1 ? 's' : ''}`}
                      </div>
                    </div>
                    {a.status === 'ACCEPTED' ? <Pill tone="ok" dot>Accepted</Pill>
                      : a.status === 'DECLINED' ? <Pill tone="bad" dot>Reschedule asked</Pill>
                      : <Pill tone="warn" dot>Not accepted</Pill>}
                  </div>
                );
              })}
              {days > 1 && (
                <p className="xs subtle" style={{ marginTop: 'var(--s3)' }}>
                  This is a {days}-day job, so each engineer is expected to check in on every day they attend —
                  {' '}{days * (job.assignments.length || 1)} check-ins in total if everyone attends throughout.
                </p>
              )}
            </div>
          ) : (
            <Empty icon="users" title="Nobody assigned"
              text="Edit the job to assign engineers. It will then appear on their calendars."
              action={can('job', 'assign') ? <Button variant="primary" onClick={() => setEditing(true)}>Assign crew</Button> : null} />
          )}
        </Card>
      )}

      {tab === 'presence' && (
        <Card title="Site check-ins" subtitle="Geo-tagged selfies proving attendance on site">
          {checkIns.length ? (
            <div className="col" style={{ gap: 'var(--s4)' }}>
              {checkIns.map((c) => (
                <div key={c._id} className="row" style={{ gap: 'var(--s4)', alignItems: 'flex-start' }}>
                  {c.in?.media && (
                    <button className="shot" style={{ width: 86, flex: '0 0 86px' }}
                      onClick={() => setLightbox({ src: mediaUrl(c.in.media), caption: `${c.user?.name} — ${fmtDateTime(c.in.at)}` })}>
                      <img src={mediaUrl(c.in.media)} alt={`Check-in selfie for ${c.user?.name}`} />
                    </button>
                  )}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                      <span className="strong">{c.user?.name}</span>
                      <span className="small muted">{c.date}</span>
                      {c.outOfGeofence
                        ? <Pill tone="bad" dot>Outside geofence</Pill>
                        : <Pill tone="ok" dot>Verified on site</Pill>}
                      {c.reviewStatus === 'APPROVED' && c.outOfGeofence && <Pill tone="ok">Reviewed</Pill>}
                    </div>
                    <dl className="geo-readout" style={{ marginTop: 'var(--s2)' }}>
                      <div><dt>Checked in</dt><dd>{fmtTime(c.in?.at)}</dd></div>
                      <div><dt>Checked out</dt><dd>{c.out?.at ? fmtTime(c.out.at) : '— still on site'}</dd></div>
                      <div><dt>Distance from site</dt><dd>{formatDistance(c.distanceMeters)}</dd></div>
                      <div><dt>Time on site</dt><dd>{c.minutesOnSite ? hours(c.minutesOnSite) : '—'}</dd></div>
                    </dl>
                    {c.in?.address && <div className="xs subtle" style={{ marginTop: 4 }}>{c.in.address}</div>}
                    {c.in?.flags?.length > 0 && (
                      <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                        {c.in.flags.map((f) => <Pill key={f} tone="warn">{title(f)}</Pill>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="camera" title="No check-ins yet"
              text="When an engineer reaches the site they take a selfie here, and their location is recorded with it." />
          )}
        </Card>
      )}

      {tab === 'photos' && (
        <Card
          title="Site photos"
          subtitle="Evidence captured on site, with location and time"
          actions={mine && !closed ? <Button size="sm" variant="primary" icon="camera" onClick={() => setCapturing(true)}>Add photo</Button> : null}
        >
          {captures.length ? (
            <div className="gallery">
              {captures.map((c) => (
                <button className="shot" key={c._id}
                  onClick={() => setLightbox({ src: mediaUrl(c.media), caption: `${c.user?.name} — ${fmtDateTime(c.createdAt)}` })}>
                  <img src={mediaUrl(c.media)} alt={c.note || 'Site photo'} loading="lazy" />
                  <div className="shot-meta">
                    <div className="row" style={{ gap: 4 }}>
                      <Pill>{title(c.phase)}</Pill>
                      <span className="xs subtle right">{relative(c.createdAt)}</span>
                    </div>
                    {c.note && <div className="xs truncate">{c.note}</div>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon="image" title="No photos yet"
              text="Before-and-after photos of the machine make the job report defensible later."
              action={mine && !closed ? <Button variant="primary" icon="camera" onClick={() => setCapturing(true)}>Take a photo</Button> : null} />
          )}
        </Card>
      )}

      {tab === 'parts' && (
        <Card
          title="Spare-part requirements"
          subtitle="Raised from this job, routed to sales and purchase"
          actions={mine && !closed ? <Button size="sm" variant="primary" icon="plus" onClick={() => setReqOpen(true)}>Raise requirement</Button> : null}
        >
          {requirements.length ? (
            <div className="col" style={{ gap: 'var(--s3)' }}>
              {requirements.map((r) => (
                <div key={r._id} className="card" style={{ padding: 'var(--s3) var(--s4)' }}>
                  <div className="row-b">
                    <div className="row" style={{ gap: 'var(--s2)' }}>
                      <StatusPill status={r.status} />
                      {r.urgency !== 'NORMAL' && <Pill tone={priorityTone(r.urgency)}>{title(r.urgency)}</Pill>}
                    </div>
                    <span className="xs subtle">{relative(r.createdAt)}</span>
                  </div>
                  <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {r.items.map((it, i) => (
                      <li key={i}>{it.quantity} {it.unit} — {it.name}{it.partNo ? ` (${it.partNo})` : ''}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="box" title="No requirements raised"
              text="If a part is needed, raise it here — it carries the job, site and photos with it."
              action={mine && !closed ? <Button variant="primary" icon="plus" onClick={() => setReqOpen(true)}>Raise requirement</Button> : null} />
          )}
        </Card>
      )}

      {/* --------------------------------------------------- modals --- */}

      <Modal
        open={!!checking} onClose={() => setChecking(null)}
        title={checking === 'in' ? `Check in at ${job.site?.name}` : 'Check out of site'}
      >
        <SelfieCapture
          target={job.site?.location}
          geofenceRadius={job.site?.geofenceRadius}
          actionLabel={checking === 'in' ? 'Check in' : 'Check out'}
          onCapture={checking === 'in' ? doCheckIn : doCheckOut}
        />
      </Modal>

      {capturing && (
        <CaptureModal jobId={id} onClose={() => setCapturing(false)}
          onSaved={() => { setCapturing(false); load(); }} />
      )}

      {reqOpen && (
        <RequirementModal jobId={id} onClose={() => setReqOpen(false)}
          onSaved={() => { setReqOpen(false); load(); }} />
      )}

      {editing && (
        <JobForm job={job} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }} />
      )}

      <ConfirmModal
        open={!!statusTo} onClose={() => setStatusTo(null)} onConfirm={changeStatus}
        title={`Move job to ${title(statusTo || '')}`}
        confirmLabel={`Move to ${title(statusTo || '')}`}
        danger={statusTo === 'CANCELLED'}
        requireReason={statusTo === 'ON_HOLD' || statusTo === 'CANCELLED'}
        message={
          statusTo === 'ON_HOLD' ? 'An on-hold job stops counting as overdue while it waits for parts.'
            : statusTo === 'CLOSED' ? 'Closing the job locks it. Add any completion notes below.'
            : `This job will move to ${title(statusTo || '')}.`
        }
      />

      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/* ------------------------------------------------------ sub-modals */

function CaptureModal({ jobId, onClose, onSaved }) {
  const toast = useToast();
  const [shot, setShot] = useState(null);
  const [phase, setPhase] = useState('DURING');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (payload) => {
    setBusy(true);
    try {
      await api.post('/captures', {
        job: jobId, image: payload.selfie, phase, note,
        lat: payload.lat, lng: payload.lng,
      });
      toast.ok('Photo added to the job');
      onSaved();
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Capture site photo">
      <div className="form-grid" style={{ marginBottom: 'var(--s4)' }}>
        <Field label="Phase">
          <Select value={phase} onChange={(e) => setPhase(e.target.value)}
            options={[{ value: 'BEFORE', label: 'Before work' }, { value: 'DURING', label: 'During work' }, { value: 'AFTER', label: 'After work' }]} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What does this show?" />
        </Field>
      </div>
      <SelfieCapture onCapture={save} busy={busy} actionLabel="Save photo" />
    </Modal>
  );
}

function RequirementModal({ jobId, onClose, onSaved }) {
  const toast = useToast();
  const [items, setItems] = useState([{ name: '', partNo: '', quantity: 1, unit: 'nos' }]);
  const [urgency, setUrgency] = useState('NORMAL');
  const [busy, setBusy] = useState(false);

  const setItem = (i, k, v) => setItems((list) => list.map((it, n) => (n === i ? { ...it, [k]: v } : it)));

  const save = async () => {
    const clean = items.filter((i) => i.name.trim());
    if (!clean.length) return toast.error('Add at least one item');
    setBusy(true);
    try {
      await api.post('/requirements', { job: jobId, items: clean, urgency });
      toast.ok('Requirement raised');
      onSaved();
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} title="Raise a requirement" width="wide"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Raise requirement</Button></>}
    >
      <Field label="Urgency" className="span-2">
        <Select value={urgency} onChange={(e) => setUrgency(e.target.value)} options={['LOW', 'NORMAL', 'HIGH', 'URGENT']} />
      </Field>

      <div className="label-xs" style={{ margin: 'var(--s5) 0 var(--s2)' }}>Items needed</div>
      {items.map((it, i) => (
        <div key={i} className="row" style={{ gap: 'var(--s2)', marginBottom: 'var(--s2)', alignItems: 'flex-end' }}>
          <Field label={i === 0 ? 'Part name' : null} className="grow">
            <Input value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} placeholder="e.g. Seal kit" />
          </Field>
          <Field label={i === 0 ? 'Part no.' : null} className="hide-mobile">
            <Input value={it.partNo} onChange={(e) => setItem(i, 'partNo', e.target.value)} style={{ width: 120 }} />
          </Field>
          <Field label={i === 0 ? 'Qty' : null}>
            <Input type="number" min="1" value={it.quantity}
              onChange={(e) => setItem(i, 'quantity', Number(e.target.value))} style={{ width: 72 }} />
          </Field>
          <Button variant="ghost" icon="x" aria-label="Remove item"
            onClick={() => setItems((l) => l.filter((_, n) => n !== i))} disabled={items.length === 1} />
        </div>
      ))}
      <Button size="sm" icon="plus" onClick={() => setItems((l) => [...l, { name: '', partNo: '', quantity: 1, unit: 'nos' }])}>
        Add another item
      </Button>
    </Modal>
  );
}
