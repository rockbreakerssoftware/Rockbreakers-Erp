import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  Modal, Button, Field, Input, Select, Textarea, Avatar, Pill, Banner, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import { JOB_TYPES, PRIORITIES, toLocalInput, title, daysBetween } from '../lib/format';

const CREW_HINT = {
  INSTALLATION: 'Installations usually run several days and need a crew. Mark one person as lead.',
  BREAKDOWN: 'Breakdowns are usually one or two engineers, same day.',
};

/**
 * Creates or edits a job. Crew assignment lives here rather than on a
 * separate screen because who is going is part of scheduling, not an
 * afterthought.
 */
export default function JobForm({ initial = {}, job, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!job;

  const [form, setForm] = useState(() => ({
    title: job?.title || '',
    type: job?.type || 'INSPECTION',
    priority: job?.priority || 'NORMAL',
    site: job?.site?._id || job?.site || '',
    description: job?.description || '',
    scheduledStart: toLocalInput(job?.scheduledStart || initial.scheduledStart || defaultStart()),
    scheduledEnd: toLocalInput(job?.scheduledEnd || initial.scheduledEnd || defaultEnd()),
  }));

  const [crew, setCrew] = useState(() =>
    (job?.assignments || []).map((a) => ({
      user: a.user?._id || a.user,
      name: a.user?.name,
      roleOnJob: a.roleOnJob,
    })));

  const [sites, setSites] = useState([]);
  const [people, setPeople] = useState([]);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/sites'), api.get('/users/assignable')])
      .then(([s, u]) => { setSites(s); setPeople(u); })
      .catch((e) => toast.error(e));
  }, []); // eslint-disable-line

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addPerson = (p) => {
    setCrew((c) =>
      c.some((x) => x.user === p._id)
        ? c.filter((x) => x.user !== p._id)
        : [...c, { user: p._id, name: p.name, roleOnJob: c.length === 0 ? 'LEAD' : 'MEMBER' }]);
  };

  const setLead = (userId) =>
    setCrew((c) => c.map((x) => ({ ...x, roleOnJob: x.user === userId ? 'LEAD' : x.roleOnJob === 'LEAD' ? 'MEMBER' : x.roleOnJob })));

  const setRole = (userId, role) =>
    setCrew((c) => role === 'LEAD'
      ? c.map((x) => ({ ...x, roleOnJob: x.user === userId ? 'LEAD' : x.roleOnJob === 'LEAD' ? 'MEMBER' : x.roleOnJob }))
      : c.map((x) => (x.user === userId ? { ...x, roleOnJob: role } : x)));

  const save = async () => {
    setError(null);
    if (!form.title.trim()) return setError('Give the job a title.');
    if (!form.site) return setError('Choose the site this job is on.');
    if (new Date(form.scheduledEnd) < new Date(form.scheduledStart)) {
      return setError('The end date cannot be before the start date.');
    }
    setBusy(true);
    try {
      const body = {
        ...form,
        scheduledStart: new Date(form.scheduledStart).toISOString(),
        scheduledEnd: new Date(form.scheduledEnd).toISOString(),
        assignments: crew.map((c) => ({ user: c.user, roleOnJob: c.roleOnJob })),
      };
      const saved = editing ? await api.put(`/jobs/${job._id}`, body) : await api.post('/jobs', body);
      toast.ok(editing ? 'Job updated' : 'Job scheduled');
      onSaved?.(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const days = form.scheduledStart && form.scheduledEnd
    ? daysBetween(form.scheduledStart, form.scheduledEnd) : 1;

  const filtered = people.filter((p) =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) ||
    (p.skills || []).some((s) => s.toLowerCase().includes(q.toLowerCase())));

  return (
    <Modal
      open onClose={onClose} width="wide"
      title={editing ? 'Edit job' : 'Schedule a job'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {editing ? 'Save changes' : 'Schedule job'}
          </Button>
        </>
      }
    >
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}

      <div className="form-grid">
        <Field label="Job title" required className="span-2">
          <Input value={form.title} onChange={set('title')} autoFocus
            placeholder="e.g. Breaker not developing pressure" />
        </Field>

        <Field label="Type" required>
          <Select value={form.type} onChange={set('type')} options={JOB_TYPES} />
        </Field>

        <Field label="Priority">
          <Select value={form.priority} onChange={set('priority')} options={PRIORITIES} />
        </Field>

        <Field label="Site" required className="span-2">
          <Select value={form.site} onChange={set('site')} placeholder="Choose a site…"
            options={sites.map((s) => ({ value: s._id, label: `${s.name}${s.city ? ` — ${s.city}` : ''}` }))} />
        </Field>

        <Field label="Starts" required>
          <Input type="datetime-local" value={form.scheduledStart} onChange={set('scheduledStart')} />
        </Field>

        <Field label="Ends" required hint={days > 1 ? `${days} days` : 'Same day'}>
          <Input type="datetime-local" value={form.scheduledEnd} onChange={set('scheduledEnd')} />
        </Field>

        <Field label="Description" className="span-2"
          hint="What the engineer needs to know before they travel.">
          <Textarea value={form.description} onChange={set('description')} rows={3}
            placeholder="Symptoms, machine, what to carry…" />
        </Field>
      </div>

      <hr className="divider" />

      <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
        <div>
          <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>Crew</div>
          <div className="xs subtle">
            {CREW_HINT[form.type] || 'Assign the engineers going to this site.'}
          </div>
        </div>
        <Button size="sm" icon="plus" onClick={() => setPicker((v) => !v)}>
          {picker ? 'Done' : 'Add engineer'}
        </Button>
      </div>

      {form.type === 'INSTALLATION' && crew.length < 2 && (
        <div style={{ marginBottom: 'var(--s3)' }}>
          <Banner tone="warn" icon="info">
            An installation usually needs more than one engineer. Add the rest of the crew now so the job
            shows on all of their calendars.
          </Banner>
        </div>
      )}

      {picker && (
        <div style={{ marginBottom: 'var(--s3)' }}>
          <div className="search" style={{ marginBottom: 'var(--s2)' }}>
            <Icon name="search" size={14} />
            <input className="input" placeholder="Search by name or skill…" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="picker">
            {filtered.map((p) => {
              const on = crew.some((c) => c.user === p._id);
              return (
                <button type="button" key={p._id} className={`picker-item ${on ? 'on' : ''}`}
                  onClick={() => addPerson(p)}>
                  <Avatar name={p.name} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small truncate">{p.name}</div>
                    <div className="xs subtle truncate">
                      {p.role?.name}{p.skills?.length ? ` · ${p.skills.join(', ')}` : ''}
                    </div>
                  </div>
                  {on && <Icon name="check" size={15} style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })}
            {!filtered.length && <div className="small muted" style={{ padding: 'var(--s4)' }}>Nobody matches that search.</div>}
          </div>
        </div>
      )}

      {crew.length ? (
        <div>
          {crew.map((c) => (
            <div className="crew-row" key={c.user}>
              <Avatar name={c.name} size="sm" />
              <span className="grow truncate small">{c.name}</span>
              <Select value={c.roleOnJob} onChange={(e) => setRole(c.user, e.target.value)}
                style={{ width: 110, height: 28, fontSize: 'var(--fs-sm)' }}
                options={[
                  { value: 'LEAD', label: 'Lead' },
                  { value: 'MEMBER', label: 'Member' },
                  { value: 'TRAINEE', label: 'Trainee' },
                ]} />
              <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${c.name}`}
                onClick={() => setCrew((v) => v.filter((x) => x.user !== c.user))} />
            </div>
          ))}
          <p className="xs subtle" style={{ marginTop: 'var(--s2)' }}>
            The lead closes the job and signs off the completion report. Each person gets this on their own calendar
            {days > 1 && `, on every one of the ${days} days`}.
          </p>
        </div>
      ) : (
        <p className="small muted">No engineers assigned yet — the job will sit unassigned on the schedule.</p>
      )}
    </Modal>
  );
}

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function defaultEnd() {
  const d = defaultStart();
  d.setHours(17, 0, 0, 0);
  return d;
}
