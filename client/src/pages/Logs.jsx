import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Search, Select, Empty, Skeleton, Pill, Avatar, useToast } from '../components/ui';
import Icon from '../components/Icon';
import { fmtDateTime, relative, title } from '../lib/format';

const ENTITIES = ['user', 'role', 'department', 'site', 'customer', 'job', 'attendance', 'sitecheckin', 'capture', 'requirement', 'expense', 'leave'];

const TONE = (action) => {
  if (!action) return '';
  if (/delete|reject|cancel/.test(action)) return 'bad';
  if (/create|approve|accept|activate/.test(action)) return 'ok';
  if (/status|update|reschedule|review/.test(action)) return 'info';
  if (/login|password/.test(action)) return 'accent';
  return '';
};

const ICON = (action = '') =>
  /login|password|auth/.test(action) ? 'key'
  : /delete/.test(action) ? 'trash'
  : /create/.test(action) ? 'plus'
  : /check_in|check_out|site\./.test(action) ? 'camera'
  : /expense/.test(action) ? 'receipt'
  : /requirement/.test(action) ? 'box'
  : /job/.test(action) ? 'briefcase'
  : /role|permission/.test(action) ? 'shield'
  : 'edit';

export default function Logs() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    setData(null);
    api.get('/logs', { q: q || undefined, entityType: entityType || undefined, page, limit: 60 })
      .then(setData).catch((e) => toast.error(e));
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, entityType, page]); // eslint-disable-line

  useEffect(() => { setPage(1); }, [q, entityType]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Activity log</div>
          <div className="page-sub">
            Append-only. Every approval, status change, permission edit and flagged check-in lands here.
          </div>
        </div>
        <div className="page-actions">
          <Button icon="refresh" onClick={load}>Refresh</Button>
        </div>
      </div>

      <Card bodyClass="tight">
        <div className="row wrap" style={{ gap: 'var(--s2)', marginBottom: 'var(--s4)' }}>
          <Search value={q} onChange={setQ} placeholder="Search what happened…" />
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="All records"
            options={ENTITIES.map((e) => ({ value: e, label: title(e) }))} style={{ width: 170 }} />
          <span className="right small muted">
            {data ? `${data.total.toLocaleString('en-IN')} entries` : ''}
          </span>
        </div>

        {!data ? <Skeleton rows={10} /> : data.items.length ? (
          <>
            <div className="timeline">
              {data.items.map((l) => (
                <div className="timeline-item" key={l._id}>
                  <span className={`timeline-dot ${TONE(l.action)}`} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                      <Icon name={ICON(l.action)} size={13} style={{ color: 'var(--text-subtle)' }} />
                      <span className="small">{l.summary || title(l.action)}</span>
                      <Pill>{l.action}</Pill>
                    </div>
                    <div className="xs subtle" style={{ marginTop: 2 }}>
                      {l.actorName || 'System'}
                      {l.actorRole ? ` · ${l.actorRole}` : ''}
                      {' · '}{fmtDateTime(l.at)}
                      {' · '}{relative(l.at)}
                      {l.ip ? ` · ${l.ip}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.pages > 1 && (
              <div className="row" style={{ justifyContent: 'center', gap: 'var(--s2)', marginTop: 'var(--s4)' }}>
                <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="small muted">Page {data.page} of {data.pages}</span>
                <Button size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                  Next <Icon name="chevronRight" size={13} />
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty icon="list" title="Nothing logged yet"
            text="Actions taken in the system will appear here, newest first." />
        )}
      </Card>
    </>
  );
}
