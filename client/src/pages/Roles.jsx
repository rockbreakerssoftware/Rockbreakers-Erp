import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuth, useCan } from '../lib/auth';
import {
  Card, Table, Button, Modal, Field, Input, Textarea, Pill, Empty, Skeleton,
  ConfirmModal, Banner, Select, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import { title } from '../lib/format';

const SCOPE_LABEL = { own: 'Own', team: 'Team', department: 'Dept', all: 'All' };
const SCOPE_ORDER = ['', 'own', 'team', 'department', 'all'];

export default function Roles() {
  const can = useCan();
  const { user: me } = useAuth();
  const toast = useToast();

  const [roles, setRoles] = useState(null);
  const [meta, setMeta] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setRoles(null);
    api.get('/roles').then(setRoles).catch((e) => toast.error(e));
  };

  useEffect(() => {
    load();
    api.get('/roles/meta').then(setMeta).catch(() => {});
  }, []); // eslint-disable-line

  const remove = async () => {
    try {
      await api.del(`/roles/${deleting._id}`);
      toast.ok(`Role "${deleting.name}" deleted`);
      setDeleting(null);
      load();
    } catch (e) { toast.error(e); setDeleting(null); }
  };

  const columns = [
    {
      key: 'name', label: 'Role',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <span className="cell-main">{r.name}</span>
            {r.isSystem && <Pill>Built in</Pill>}
          </div>
          {r.description && <div className="cell-sub truncate">{r.description}</div>}
        </div>
      ),
    },
    {
      key: 'permissions', label: 'Permissions', align: 'right',
      render: (r) => <span className="small muted">{r.permissions.includes('*') ? 'Everything' : r.permissions.length}</span>,
    },
    {
      key: 'userCount', label: 'Users', align: 'right',
      render: (r) => <span className="num">{r.userCount}</span>,
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {can('role', 'update') && (
            <Button size="sm" icon="edit" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>Permissions</Button>
          )}
          {can('role', 'create') && (
            <Button size="sm" icon="copy" aria-label={`Duplicate ${r.name}`}
              onClick={(e) => { e.stopPropagation(); setEditing({ cloneFrom: r }); }} />
          )}
          {can('role', 'delete') && !r.isSystem && (
            <Button size="sm" variant="danger" icon="trash" aria-label={`Delete ${r.name}`}
              onClick={(e) => { e.stopPropagation(); setDeleting(r); }} />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Roles &amp; permissions</div>
          <div className="page-sub">
            Each permission is an action on a resource, limited to a scope — own, team, department or everyone
          </div>
        </div>
        {can('role', 'create') && (
          <div className="page-actions">
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>New role</Button>
          </div>
        )}
      </div>

      <Card bodyClass="tight">
        {!roles ? <Skeleton rows={6} /> : (
          <Table columns={columns} rows={roles}
            empty={<Empty icon="shield" title="No roles yet" />} />
        )}
      </Card>

      {editing && meta && (
        <RoleEditor
          role={editing._id ? editing : null}
          cloneFrom={editing.cloneFrom}
          meta={meta}
          roles={roles || []}
          isMyRole={editing._id && String(editing._id) === String(me.role?._id)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      <ConfirmModal
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove}
        title={`Delete role "${deleting?.name}"?`} confirmLabel="Delete role" danger
        message={deleting?.userCount
          ? `${deleting.userCount} user(s) still hold this role. Move them to another role first — the delete will be refused otherwise.`
          : 'This role is not in use and can be safely removed.'}
      />
    </>
  );
}

/**
 * The permission matrix. Every cell is a resource × action pair whose value
 * is the scope, so one grid expresses the entire model rather than a wall
 * of checkboxes.
 */
function RoleEditor({ role, cloneFrom, meta, roles, isMyRole, onClose, onSaved }) {
  const toast = useToast();
  const source = role || cloneFrom;

  const [name, setName] = useState(role?.name || (cloneFrom ? `${cloneFrom.name} (copy)` : ''));
  const [description, setDescription] = useState(role?.description || cloneFrom?.description || '');
  const [perms, setPerms] = useState(() => new Set(source?.permissions || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const superUser = perms.has('*');

  const scopeOf = (resource, action) => {
    if (superUser) return 'all';
    for (const s of ['all', 'department', 'team', 'own']) {
      if (perms.has(`${resource}:${action}:${s}`)) return s;
    }
    return '';
  };

  /** Clicking a cell cycles off → own → team → department → all → off. */
  const cycle = (resource, action) => {
    const current = scopeOf(resource, action);
    const next = SCOPE_ORDER[(SCOPE_ORDER.indexOf(current) + 1) % SCOPE_ORDER.length];
    setPerms((prev) => {
      const out = new Set(prev);
      for (const s of SCOPE_ORDER) if (s) out.delete(`${resource}:${action}:${s}`);
      if (next) out.add(`${resource}:${action}:${next}`);
      return out;
    });
  };

  const setRow = (resource, actions, scope) => {
    setPerms((prev) => {
      const out = new Set(prev);
      for (const a of actions) {
        for (const s of SCOPE_ORDER) if (s) out.delete(`${resource}:${a}:${s}`);
        if (scope) out.add(`${resource}:${a}:${scope}`);
      }
      return out;
    });
  };

  const count = superUser ? 'everything' : `${perms.size} permission${perms.size === 1 ? '' : 's'}`;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the role a name.');
    setBusy(true);
    try {
      const body = { name, description, permissions: [...perms] };
      if (role) await api.put(`/roles/${role._id}`, body);
      else await api.post('/roles', body);
      toast.ok(role ? 'Permissions saved' : 'Role created');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} width="xwide"
      title={role ? `Permissions — ${role.name}` : cloneFrom ? `Duplicate of ${cloneFrom.name}` : 'New role'}
      footer={
        <>
          <span className="left small muted">{count}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{role ? 'Save permissions' : 'Create role'}</Button>
        </>
      }
    >
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}

      <div className="form-grid" style={{ marginBottom: 'var(--s5)' }}>
        <Field label="Role name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={role?.isSystem} />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" />
        </Field>
      </div>

      {superUser && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="shield">
            This role holds the unrestricted <code>*</code> permission — every action on every resource.
            The matrix below is shown for reference only.
          </Banner>
        </div>
      )}

      {isMyRole && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="info" icon="info">
            This is your own role. You cannot remove your ability to manage roles — that is the guard rail
            that stops an administrator locking everyone out.
          </Banner>
        </div>
      )}

      <div className="row-b" style={{ marginBottom: 'var(--s2)' }}>
        <span className="label-xs">Permission matrix</span>
        <span className="xs subtle hide-mobile">Click a cell to cycle: off → own → team → department → everyone</span>
      </div>

      <div className="table-wrap" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
        <table className="perm-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Create</th><th>Read</th><th>Update</th><th>Delete</th><th>Other</th>
              <th>Set all</th>
            </tr>
          </thead>
          <tbody>
            {meta.resources.map((r) => {
              const others = r.actions.filter((a) => !['create', 'read', 'update', 'delete'].includes(a));
              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  {['create', 'read', 'update', 'delete'].map((a) => (
                    <td key={a}>
                      <div className="perm-cell">
                        {r.actions.includes(a) ? (
                          <button type="button"
                            className={`perm-scope ${scopeOf(r.key, a) ? 'on' : ''}`}
                            disabled={superUser}
                            onClick={() => cycle(r.key, a)}>
                            {SCOPE_LABEL[scopeOf(r.key, a)] || '—'}
                          </button>
                        ) : <span className="subtle">·</span>}
                      </div>
                    </td>
                  ))}
                  <td>
                    <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {others.length ? others.map((a) => (
                        <button type="button" key={a}
                          className={`perm-scope ${scopeOf(r.key, a) ? 'on' : ''}`}
                          disabled={superUser}
                          style={{ minWidth: 0, padding: '0 8px' }}
                          onClick={() => cycle(r.key, a)}>
                          {title(a)}{scopeOf(r.key, a) ? ` · ${SCOPE_LABEL[scopeOf(r.key, a)]}` : ''}
                        </button>
                      )) : <span className="subtle">·</span>}
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 3, justifyContent: 'center' }}>
                      <button type="button" className="perm-scope" style={{ minWidth: 34 }} disabled={superUser}
                        title="Grant every action on this resource, for everyone"
                        onClick={() => setRow(r.key, r.actions, 'all')}>All</button>
                      <button type="button" className="perm-scope" style={{ minWidth: 34 }} disabled={superUser}
                        title="Remove every permission on this resource"
                        onClick={() => setRow(r.key, r.actions, '')}>Off</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="xs subtle" style={{ marginTop: 'var(--s3)' }}>
        Scope narrows the query on the server, not the display: a user with <strong>read · team</strong> on jobs
        never receives another team's rows at all.
      </p>
    </Modal>
  );
}
