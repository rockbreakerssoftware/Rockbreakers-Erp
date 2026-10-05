import { useEffect, useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { useAuth, useCan, scopeFor } from '../lib/auth';
import {
  Card, Table, Button, Modal, Field, Input, Select, Textarea, Pill, StatusPill,
  Empty, Skeleton, Tabs, Stat, ConfirmModal, Lightbox, Avatar, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import { EXPENSE_CATEGORIES, money, fmtDate, title, dateKey, relative } from '../lib/format';

const NEXT_ACTION = {
  SUBMITTED: { to: 'MANAGER_APPROVED', label: 'Approve' },
  MANAGER_APPROVED: { to: 'VERIFIED', label: 'Verify' },
  VERIFIED: { to: 'REIMBURSED', label: 'Mark reimbursed' },
};

export default function Expenses() {
  const { user } = useAuth();
  const can = useCan();
  const toast = useToast();

  const canApprove = can('expense', 'approve');
  const wide = scopeFor(user, 'expense', 'read') !== 'own';

  const [tab, setTab] = useState(canApprove ? 'pending' : 'mine');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const load = () => {
    setRows(null);
    const params =
      tab === 'pending' ? { status: 'SUBMITTED,MANAGER_APPROVED,VERIFIED' }
      : tab === 'mine' ? { user: user._id }
      : {};
    api.get('/expenses', params).then(setRows).catch((e) => toast.error(e));
  };

  useEffect(load, [tab]); // eslint-disable-line
  useEffect(() => { api.get('/expenses/summary').then(setSummary).catch(() => {}); }, [rows]);

  const act = async (note) => {
    try {
      await api.patch(`/expenses/${acting.row._id}/status`, { status: acting.to, note });
      toast.ok(`Expense ${title(acting.to).toLowerCase()}`);
      setActing(null);
      load();
    } catch (e) { toast.error(e); setActing(null); }
  };

  const tabs = [
    ...(canApprove ? [{ key: 'pending', label: 'Awaiting action' }] : []),
    { key: 'mine', label: 'My expenses' },
    ...(wide ? [{ key: 'all', label: 'All' }] : []),
  ];

  const columns = [
    { key: 'date', label: 'Date', render: (r) => <span className="small nowrap">{fmtDate(r.date)}</span> },
    ...(tab !== 'mine' ? [{
      key: 'user', label: 'Employee',
      render: (r) => (
        <div className="row" style={{ gap: 'var(--s2)' }}>
          <Avatar name={r.user?.name} size="sm" /><span className="small truncate">{r.user?.name}</span>
        </div>
      ),
    }] : []),
    { key: 'category', label: 'Category', render: (r) => <Pill>{title(r.category)}</Pill> },
    {
      key: 'site', label: 'Site',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div className="small truncate">{r.site?.name || '—'}</div>
          {r.job?.title && <div className="xs subtle truncate">{r.job.title}</div>}
        </div>
      ),
    },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className="strong num">{money(r.amount)}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
    {
      key: 'actions', label: '',
      render: (r) => {
        const next = NEXT_ACTION[r.status];
        return (
          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
            {r.receipt && (
              <Button size="sm" icon="image" aria-label="View receipt"
                onClick={(e) => { e.stopPropagation(); setReceipt({ src: mediaUrl(r.receipt), caption: `${r.category} — ${money(r.amount)}` }); }} />
            )}
            {canApprove && next && (
              <>
                <Button size="sm" variant="primary"
                  onClick={(e) => { e.stopPropagation(); setActing({ row: r, to: next.to, label: next.label }); }}>
                  {next.label}
                </Button>
                <Button size="sm" variant="danger"
                  onClick={(e) => { e.stopPropagation(); setActing({ row: r, to: 'REJECTED', label: 'Reject' }); }}>
                  Reject
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const pendingTotal = summary?.byStatus
    ?.filter((s) => ['SUBMITTED', 'MANAGER_APPROVED', 'VERIFIED'].includes(s._id))
    .reduce((a, b) => a + b.total, 0) || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Expenses</div>
          <div className="page-sub">
            Every claim is tagged to a site and a category — that is what makes per-site cost a single query
          </div>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Submit expense</Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-4" style={{ marginBottom: 'var(--s5)' }}>
          <Stat label="In the approval chain" value={money(pendingTotal)} tone={pendingTotal ? 'warn' : 'ok'} />
          <Stat label="Reimbursed" value={money(summary.byStatus?.find((s) => s._id === 'REIMBURSED')?.total || 0)} />
          <Stat label="Top category"
            value={summary.byCategory?.[0] ? title(summary.byCategory[0]._id) : '—'}
            hint={summary.byCategory?.[0] ? money(summary.byCategory[0].total) : undefined} />
          <Stat label="Top site by cost"
            value={summary.bySite?.[0]?.name || '—'}
            hint={summary.bySite?.[0] ? money(summary.bySite[0].total) : undefined} />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: summary?.bySite?.length ? '1.6fr 1fr' : '1fr', alignItems: 'start' }}>
        <Card bodyClass="tight">
          <div style={{ marginBottom: 'var(--s3)' }}>
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
          </div>
          {!rows ? <Skeleton rows={6} /> : (
            <Table columns={columns} rows={rows}
              empty={<Empty icon="receipt"
                title={tab === 'pending' ? 'Nothing awaiting action' : 'No expenses yet'}
                text={tab === 'pending'
                  ? 'Every submitted claim has been dealt with.'
                  : 'Submit a claim against the job you were working on.'}
                action={tab !== 'pending' ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Submit expense</Button> : null} />} />
          )}
        </Card>

        {summary?.bySite?.length > 0 && (
          <div>
            <Card title="Cost by site">
              <BarList items={summary.bySite.slice(0, 6).map((s) => ({ label: s.name || 'Unassigned', value: s.total }))} />
            </Card>
            <Card title="Cost by category">
              <BarList items={summary.byCategory.map((c) => ({ label: title(c._id), value: c.total }))} />
            </Card>
          </div>
        )}
      </div>

      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}

      <ConfirmModal
        open={!!acting} onClose={() => setActing(null)} onConfirm={act}
        title={`${acting?.label} expense of ${money(acting?.row?.amount)}`}
        confirmLabel={acting?.label} danger={acting?.to === 'REJECTED'}
        requireReason={acting?.to === 'REJECTED'}
        message={acting?.to === 'REJECTED'
          ? 'The reason is shown to the employee and recorded in the activity log.'
          : `This moves the claim to ${title(acting?.to || '')}. The step is recorded with your name.`}
      />

      {receipt && <Lightbox {...receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function BarList({ items }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <Empty icon="chart" title="No data yet" />;
  return (
    <div className="bar-chart">
      {items.map((i) => (
        <div className="bar-item" key={i.label}>
          <span className="truncate small">{i.label}</span>
          <span className="small strong num">{money(i.value)}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function ExpenseForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    category: 'TRAVEL', amount: '', date: dateKey(), job: '', site: '', description: '',
  });
  const [jobs, setJobs] = useState([]);
  const [sites, setSites] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/jobs'), api.get('/sites')])
      .then(([j, s]) => { setJobs(j); setSites(s); })
      .catch(() => {});
  }, []);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Picking a job fills the site, because the site tag is mandatory and
      // the engineer should not have to remember which site a job was on.
      if (k === 'job' && v) {
        const job = jobs.find((x) => x._id === v);
        if (job?.site) next.site = job.site._id || job.site;
      }
      return next;
    });
  };

  const pickReceipt = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Receipts are compressed client-side — the database is 512 MB.
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = img.width * scale;
        c.height = img.height * scale;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        setReceipt(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setError(null);
    if (!form.amount || Number(form.amount) <= 0) return setError('Enter the amount.');
    if (!form.site) return setError('Choose the site — every expense must be tagged to one.');
    setBusy(true);
    try {
      await api.post('/expenses', {
        ...form, amount: Number(form.amount),
        job: form.job || undefined,
        receiptImage: receipt || undefined,
      });
      toast.ok('Expense submitted');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Submit an expense"
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy}>Submit</Button></>}>
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}

      <div className="form-grid">
        <Field label="Category" required>
          <Select value={form.category} onChange={set('category')} options={EXPENSE_CATEGORIES} />
        </Field>
        <Field label="Amount" required>
          <Input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={set('date')} />
        </Field>
        <Field label="Job" hint="Fills the site for you">
          <Select value={form.job} onChange={set('job')} placeholder="Not against a job"
            options={jobs.map((j) => ({ value: j._id, label: j.title }))} />
        </Field>
        <Field label="Site" required className="span-2"
          hint="Mandatory — this is what makes per-site cost reportable.">
          <Select value={form.site} onChange={set('site')} placeholder="Choose a site…"
            options={sites.map((s) => ({ value: s._id, label: s.name }))} />
        </Field>
        <Field label="Description" className="span-2">
          <Textarea value={form.description} onChange={set('description')} rows={2}
            placeholder="e.g. Taxi from Pune to Wagholi and back" />
        </Field>
      </div>

      <hr className="divider" />

      <Field label="Receipt photo" hint="Optional, but approvals go faster with one.">
        <div className="row" style={{ gap: 'var(--s3)' }}>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <Icon name="image" size={15} /> Choose photo
            <input type="file" accept="image/*" capture="environment" onChange={pickReceipt} style={{ display: 'none' }} />
          </label>
          {receipt && (
            <>
              <img src={receipt} alt="Receipt preview" style={{ height: 44, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }} />
              <Button variant="ghost" icon="x" aria-label="Remove receipt" onClick={() => setReceipt(null)} />
            </>
          )}
        </div>
      </Field>
    </Modal>
  );
}

function Banner({ tone, icon, children }) {
  return (
    <div className={`banner ${tone}`}>
      <Icon name={icon} size={15} />
      <div className="grow">{children}</div>
    </div>
  );
}
