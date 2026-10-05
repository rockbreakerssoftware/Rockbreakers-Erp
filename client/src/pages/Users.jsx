import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth, useCan } from '../lib/auth';
import {
  Card, Table, Button, Search, Select, Field, Input, Modal, Pill, Avatar, Empty,
  Skeleton, ConfirmModal, Banner, useToast,
} from '../components/ui';
import { fmtDate } from '../lib/format';

export default function Users() {
  const can = useCan();
  const { user: me } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [resetting, setResetting] = useState(null);

  const load = () => {
    setUsers(null);
    api.get('/users', { q: q || undefined, role: roleFilter || undefined })
      .then(setUsers).catch((e) => toast.error(e));
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, roleFilter]); // eslint-disable-line

  useEffect(() => {
    api.get('/roles').then(setRoles).catch(() => {});
    api.get('/departments').then(setDepartments).catch(() => {});
  }, []);

  const toggleActive = async (u) => {
    try {
      await api.patch(`/users/${u._id}/active`, { active: !u.active });
      toast.ok(`${u.name} ${u.active ? 'deactivated' : 'activated'}`);
      load();
    } catch (e) { toast.error(e); }
  };

  const remove = async () => {
    try {
      await api.del(`/users/${deleting._id}`);
      toast.ok(`${deleting.name} removed`);
      setDeleting(null);
      load();
    } catch (e) { toast.error(e); setDeleting(null); }
  };

  const columns = [
    {
      key: 'name', label: 'Employee',
      render: (u) => (
        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Avatar name={u.name} />
          <div style={{ minWidth: 0 }}>
            <div className="cell-main truncate">
              {u.name}{String(u._id) === String(me._id) && <span className="muted small"> (you)</span>}
            </div>
            <div className="cell-sub truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Role', render: (u) => <Pill>{u.role?.name || '—'}</Pill> },
    { key: 'department', label: 'Department', render: (u) => <span className="small">{u.department?.name || '—'}</span> },
    { key: 'designation', label: 'Designation', render: (u) => <span className="small muted">{u.designation || '—'}</span> },
    { key: 'reportsTo', label: 'Reports to', render: (u) => <span className="small muted">{u.reportsTo?.name || '—'}</span> },
    { key: 'status', label: 'Status', render: (u) => (u.active ? <Pill tone="ok" dot>Active</Pill> : <Pill dot>Inactive</Pill>) },
    {
      key: 'actions', label: '',
      render: (u) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {can('user', 'update') && (
            <>
              <Button size="sm" icon="edit" onClick={(e) => { e.stopPropagation(); setEditing(u); }} aria-label={`Edit ${u.name}`} />
              <Button size="sm" icon="key" onClick={(e) => { e.stopPropagation(); setResetting(u); }} aria-label={`Reset password for ${u.name}`} />
              <Button size="sm" onClick={(e) => { e.stopPropagation(); toggleActive(u); }}>
                {u.active ? 'Disable' : 'Enable'}
              </Button>
            </>
          )}
          {can('user', 'delete') && (
            <Button size="sm" variant="danger" icon="trash"
              onClick={(e) => { e.stopPropagation(); setDeleting(u); }} aria-label={`Delete ${u.name}`} />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Users</div>
          <div className="page-sub">Everyone with an account, across every department</div>
        </div>
        {can('user', 'create') && (
          <div className="page-actions">
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>Add user</Button>
          </div>
        )}
      </div>

      <Card bodyClass="tight">
        <div className="row wrap" style={{ gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
          <Search value={q} onChange={setQ} placeholder="Search name, email or phone…" />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} placeholder="All roles"
            options={roles.map((r) => ({ value: r._id, label: r.name }))} style={{ width: 180 }} />
          <span className="right small muted">{users?.length ?? ''} {users?.length === 1 ? 'user' : 'users'}</span>
        </div>

        {!users ? <Skeleton rows={6} /> : (
          <Table columns={columns} rows={users}
            empty={<Empty icon="users" title={q ? 'No users match' : 'No users yet'}
              text={q ? 'Try a different name or email.' : 'Add your first user to get started.'} />} />
        )}
      </Card>

      {editing && (
        <UserForm user={editing._id ? editing : null} roles={roles} departments={departments} users={users || []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      {resetting && (
        <PasswordReset user={resetting} onClose={() => setResetting(null)} />
      )}

      <ConfirmModal
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove}
        title={`Remove ${deleting?.name}?`} confirmLabel="Remove user" danger
        message={
          'The account is disabled and hidden, but their attendance, site check-ins and approvals are kept '
          + 'so the audit trail stays intact. If they are still assigned to open jobs, reassign that work first.'
        }
      />
    </>
  );
}

function UserForm({ user, roles, departments, users, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!user;
  const [form, setForm] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
    employeeCode: user?.employeeCode || '',
    role: user?.role?._id || user?.role || '',
    department: user?.department?._id || user?.department || '',
    reportsTo: user?.reportsTo?._id || user?.reportsTo || '',
    skills: (user?.skills || []).join(', '),
    password: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.email.trim()) return setError('Email is required.');
    if (!form.role) return setError('Choose a role — it decides what this person can do.');
    if (!editing && form.password.length < 8) return setError('Set a password of at least 8 characters.');

    setBusy(true);
    try {
      const body = {
        ...form,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        reportsTo: form.reportsTo || undefined,
        department: form.department || undefined,
      };
      if (editing) {
        delete body.password;
        await api.put(`/users/${user._id}`, body);
      } else {
        await api.post('/users', body);
      }
      toast.ok(editing ? 'User updated' : 'User created');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} width="wide" title={editing ? `Edit ${user.name}` : 'Add a user'}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save changes' : 'Create user'}</Button></>}
    >
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}

      <div className="form-grid">
        <Field label="Full name" required><Input value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Employee code"><Input value={form.employeeCode} onChange={set('employeeCode')} placeholder="Optional" /></Field>
        <Field label="Email address" required hint="This is also their sign-in name.">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>

        <Field label="Role" required hint="Decides what they can see and do.">
          <Select value={form.role} onChange={set('role')} placeholder="Choose a role…"
            options={roles.map((r) => ({ value: r._id, label: r.name }))} />
        </Field>
        <Field label="Department">
          <Select value={form.department} onChange={set('department')} placeholder="No department"
            options={departments.map((d) => ({ value: d._id, label: d.name }))} />
        </Field>

        <Field label="Designation"><Input value={form.designation} onChange={set('designation')} placeholder="e.g. Service Engineer" /></Field>
        <Field label="Reports to">
          <Select value={form.reportsTo} onChange={set('reportsTo')} placeholder="Nobody"
            options={users.filter((u) => u._id !== user?._id).map((u) => ({ value: u._id, label: u.name }))} />
        </Field>

        <Field label="Skills" className="span-2" hint="Comma separated. Used when assigning crews.">
          <Input value={form.skills} onChange={set('skills')} placeholder="Hydraulic breaker, Crusher, Welding" />
        </Field>

        {!editing && (
          <Field label="Initial password" required className="span-2" hint="At least 8 characters. They can change it after signing in.">
            <Input type="text" value={form.password} onChange={set('password')} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PasswordReset({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/users/${user._id}/password`, { newPassword: pw });
      toast.ok(`Password reset for ${user.name}`);
      onClose();
    } catch (e) { toast.error(e); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={pw.length < 8}>Reset password</Button></>}>
      <Field label="New password" required hint="At least 8 characters. Pass it to them directly — it is not emailed.">
        <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
      <p className="xs subtle" style={{ marginTop: 'var(--s3)' }}>
        This action is written to the activity log.
      </p>
    </Modal>
  );
}
