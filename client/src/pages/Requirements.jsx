import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCan } from '../lib/auth';
import {
  Card, Button, Pill, StatusPill, Empty, Skeleton, Tabs, Avatar, ConfirmModal,
  Modal, Field, Input, useToast,
} from '../components/ui';
import { title, relative, priorityTone, fmtDate } from '../lib/format';

const TABS = [
  { key: 'open', label: 'Open', statuses: 'SUBMITTED,MANAGER_APPROVED,IN_PURCHASE' },
  { key: 'submitted', label: 'Awaiting approval', statuses: 'SUBMITTED' },
  { key: 'closed', label: 'Closed', statuses: 'FULFILLED,REJECTED' },
  { key: 'all', label: 'All', statuses: '' },
];

export default function Requirements() {
  const can = useCan();
  const navigate = useNavigate();
  const toast = useToast();
  const canApprove = can('requirement', 'approve');

  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState(null);
  const [acting, setActing] = useState(null);
  const [dating, setDating] = useState(null);

  const load = () => {
    setRows(null);
    const statuses = TABS.find((t) => t.key === tab)?.statuses;
    api.get('/requirements', { status: statuses || undefined })
      .then(setRows).catch((e) => toast.error(e));
  };

  useEffect(load, [tab]); // eslint-disable-line

  const act = async (note) => {
    try {
      await api.patch(`/requirements/${acting.row._id}/status`, { status: acting.to, note });
      toast.ok(`Requirement ${title(acting.to).toLowerCase()}`);
      setActing(null);
      load();
    } catch (e) { toast.error(e); setActing(null); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Requirements</div>
          <div className="page-sub">
            Spare parts raised from the field — each one carries its job, site and photos with it
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--s4)' }}>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {!rows ? <Card><Skeleton rows={6} /></Card> : rows.length ? (
        <div className="col" style={{ gap: 'var(--s3)' }}>
          {rows.map((r) => (
            <Card key={r._id} bodyClass="tight">
              <div className="row-b wrap" style={{ gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  <StatusPill status={r.status} />
                  {r.urgency !== 'NORMAL' && <Pill tone={priorityTone(r.urgency)} dot>{title(r.urgency)}</Pill>}
                  <button className="btn sm ghost" onClick={() => navigate(`/jobs/${r.job?._id || r.job}`)}>
                    {r.job?.title || 'Open job'}
                  </button>
                </div>
                <span className="xs subtle">{relative(r.createdAt)}</span>
              </div>

              <div className="row wrap" style={{ gap: 'var(--s4)', alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 220 }}>
                  <table className="tbl" style={{ fontSize: 'var(--fs-sm)' }}>
                    <tbody>
                      {r.items.map((it, i) => (
                        <tr key={i}>
                          <td style={{ height: 28, paddingLeft: 0 }}>{it.name}</td>
                          <td className="muted" style={{ height: 28 }}>{it.partNo || '—'}</td>
                          <td className="num" style={{ height: 28, paddingRight: 0 }}>{it.quantity} {it.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ minWidth: 180 }}>
                  <div className="xs subtle">Raised by</div>
                  <div className="row" style={{ gap: 'var(--s2)', marginTop: 2 }}>
                    <Avatar name={r.raisedBy?.name} size="sm" />
                    <span className="small">{r.raisedBy?.name}</span>
                  </div>
                  <div className="xs subtle" style={{ marginTop: 'var(--s2)' }}>Site</div>
                  <div className="small">{r.site?.name || '—'}</div>
                  {r.expectedDate && (
                    <>
                      <div className="xs subtle" style={{ marginTop: 'var(--s2)' }}>Expected</div>
                      <div className="small">{fmtDate(r.expectedDate)}</div>
                    </>
                  )}
                </div>
              </div>

              {r.approvals?.length > 0 && (
                <div className="xs subtle" style={{ marginTop: 'var(--s2)' }}>
                  Last action: {title(r.approvals[r.approvals.length - 1].action)} by{' '}
                  {r.approvals[r.approvals.length - 1].by?.name}
                  {r.approvals[r.approvals.length - 1].note && ` — ${r.approvals[r.approvals.length - 1].note}`}
                </div>
              )}

              {canApprove && ['SUBMITTED', 'MANAGER_APPROVED'].includes(r.status) && (
                <div className="row wrap" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
                  {r.status === 'SUBMITTED' && (
                    <Button size="sm" variant="primary" icon="check"
                      onClick={() => setActing({ row: r, to: 'MANAGER_APPROVED', label: 'Approve' })}>
                      Approve
                    </Button>
                  )}
                  {r.status === 'MANAGER_APPROVED' && (
                    <>
                      <Button size="sm" variant="primary"
                        onClick={() => setActing({ row: r, to: 'IN_PURCHASE', label: 'Send to purchase' })}>
                        Send to purchase
                      </Button>
                      <Button size="sm" onClick={() => setDating(r)}>Commit a date</Button>
                    </>
                  )}
                  <Button size="sm" variant="danger"
                    onClick={() => setActing({ row: r, to: 'REJECTED', label: 'Reject' })}>
                    Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty icon="box" title="No requirements here"
            text="Engineers raise these from a job when a part is needed. They appear here for approval." />
        </Card>
      )}

      <ConfirmModal
        open={!!acting} onClose={() => setActing(null)} onConfirm={act}
        title={`${acting?.label} this requirement`} confirmLabel={acting?.label}
        danger={acting?.to === 'REJECTED'} requireReason={acting?.to === 'REJECTED'}
        message={acting?.to === 'REJECTED'
          ? 'The engineer who raised it sees this reason, and it is written to the activity log.'
          : 'This moves the requirement forward and is recorded with your name.'}
      />

      {dating && <DateModal row={dating} onClose={() => setDating(null)} onSaved={() => { setDating(null); load(); }} />}
    </>
  );
}

function DateModal({ row, onClose, onSaved }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/requirements/${row._id}/status`, {
        status: 'IN_PURCHASE', expectedDate: date, note: `Committed delivery ${date}`,
      });
      toast.ok('Delivery date committed');
      onSaved();
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Commit a delivery date"
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={!date}>Commit date</Button></>}>
      <Field label="Expected delivery" required
        hint="This flows back to the job, so the engineer can see when their part arrives without asking.">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
