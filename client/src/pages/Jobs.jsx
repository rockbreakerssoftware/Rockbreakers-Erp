import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCan } from '../lib/auth';
import {
  Button, Card, Table, Search, Select, Pill, StatusPill, AvatarStack, Empty, Skeleton, Tabs, useToast,
} from '../components/ui';
import JobForm from './JobForm';
import { JOB_TYPES, fmtRange, title, priorityTone } from '../lib/format';

const TABS = [
  { key: 'open', label: 'Open', statuses: 'SCHEDULED,ACCEPTED,IN_PROGRESS' },
  { key: 'hold', label: 'On hold', statuses: 'ON_HOLD' },
  { key: 'done', label: 'Completed', statuses: 'WORK_DONE,CLOSED' },
  { key: 'all', label: 'All', statuses: '' },
];

export default function Jobs() {
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();

  const [tab, setTab] = useState('open');
  const [jobs, setJobs] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    const statuses = TABS.find((t) => t.key === tab)?.statuses;
    setJobs(null);
    api.get('/jobs', { status: statuses || undefined, type: type || undefined })
      .then(setJobs)
      .catch((e) => toast.error(e));
  };

  useEffect(load, [tab, type]); // eslint-disable-line

  const rows = useMemo(() => {
    if (!jobs) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) =>
      j.title.toLowerCase().includes(needle) ||
      j.site?.name?.toLowerCase().includes(needle) ||
      j.assignments?.some((a) => a.user?.name?.toLowerCase().includes(needle)));
  }, [jobs, q]);

  const columns = [
    {
      key: 'title', label: 'Job',
      render: (j) => (
        <div style={{ minWidth: 0 }}>
          <div className="cell-main truncate">{j.title}</div>
          <div className="cell-sub truncate">{j.site?.name}{j.site?.city ? ` · ${j.site.city}` : ''}</div>
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (j) => <Pill>{title(j.type)}</Pill> },
    {
      key: 'priority', label: 'Priority',
      render: (j) => (j.priority === 'NORMAL' || j.priority === 'LOW'
        ? <span className="muted small">{title(j.priority)}</span>
        : <Pill tone={priorityTone(j.priority)} dot>{title(j.priority)}</Pill>),
    },
    { key: 'when', label: 'Scheduled', render: (j) => <span className="small nowrap">{fmtRange(j.scheduledStart, j.scheduledEnd)}</span> },
    {
      key: 'crew', label: 'Crew',
      render: (j) => (j.assignments?.length
        ? <AvatarStack people={j.assignments.map((a) => a.user)} />
        : <Pill tone="warn">Unassigned</Pill>),
    },
    { key: 'status', label: 'Status', render: (j) => <StatusPill status={j.status} /> },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Jobs</div>
          <div className="page-sub">Visits, installations, breakdowns and preventive service</div>
        </div>
        {can('job', 'create') && (
          <div className="page-actions">
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Schedule job</Button>
          </div>
        )}
      </div>

      <Card bodyClass="tight">
        <div className="row-b wrap" style={{ marginBottom: 'var(--s3)' }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="All types"
              options={JOB_TYPES} style={{ width: 150 }} />
            <Search value={q} onChange={setQ} placeholder="Search jobs, sites, engineers…" />
          </div>
        </div>

        {!rows ? (
          <Skeleton rows={6} />
        ) : (
          <Table
            columns={columns}
            rows={rows}
            onRowClick={(j) => navigate(`/jobs/${j._id}`)}
            empty={
              <Empty
                icon="briefcase"
                title={q ? 'No jobs match that search' : 'No jobs here'}
                text={q
                  ? 'Try a different name, site or engineer.'
                  : 'Scheduled work shows up here and on everyone’s calendar.'}
                action={can('job', 'create') && !q
                  ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Schedule a job</Button>
                  : null}
              />
            }
          />
        )}
      </Card>

      {creating && (
        <JobForm
          onClose={() => setCreating(false)}
          onSaved={(j) => { setCreating(false); navigate(`/jobs/${j._id}`); }}
        />
      )}
    </>
  );
}
