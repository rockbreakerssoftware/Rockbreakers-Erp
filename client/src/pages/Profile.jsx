import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, Button, Field, Input, Banner, Avatar, Pill, useToast } from '../components/ui';
import { title } from '../lib/format';

export default function Profile() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const change = async () => {
    setError(null);
    if (form.newPassword.length < 8) return setError('The new password must be at least 8 characters.');
    if (form.newPassword !== form.confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', form);
      toast.ok('Password changed');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const perms = user.role?.permissions || [];
  const grouped = perms.includes('*') ? null : perms.reduce((acc, p) => {
    const [r, a, s] = p.split(':');
    (acc[r] ||= []).push(`${a} · ${s}`);
    return acc;
  }, {});

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">My profile</div>
          <div className="page-sub">Your account and what it lets you do</div>
        </div>
        <div className="page-actions">
          <Button icon="logout" variant="danger" onClick={logout}>Sign out</Button>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div>
          <Card title="Account">
            <div className="row" style={{ gap: 'var(--s4)', marginBottom: 'var(--s4)' }}>
              <Avatar name={user.name} size="lg" accent />
              <div>
                <div className="strong">{user.name}</div>
                <div className="small muted">{user.designation || user.role?.name}</div>
              </div>
            </div>
            <dl className="kv">
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Phone</dt><dd>{user.phone || '—'}</dd>
              <dt>Role</dt><dd><Pill tone="accent">{user.role?.name}</Pill></dd>
              <dt>Department</dt><dd>{user.department?.name || '—'}</dd>
            </dl>
            <p className="xs subtle" style={{ marginTop: 'var(--s4)' }}>
              Your name, role and department are managed by an administrator. Ask them if any of this is wrong.
            </p>
          </Card>

          <Card title="Change password">
            {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}
            <div className="col" style={{ gap: 'var(--s4)' }}>
              <Field label="Current password">
                <Input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="At least 8 characters.">
                <Input type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password">
                <Input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
              </Field>
              <Button variant="primary" onClick={change} loading={busy}
                disabled={!form.currentPassword || !form.newPassword}>
                Change password
              </Button>
            </div>
          </Card>
        </div>

        <Card title="What you can do" subtitle={`From the ${user.role?.name} role`}>
          {!grouped ? (
            <Banner tone="warn" icon="shield">
              This account holds unrestricted access — every action on every record, including roles and permissions.
            </Banner>
          ) : (
            <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
              {Object.entries(grouped).map(([resource, list]) => (
                <div key={resource} style={{ display: 'contents' }}>
                  <dt>{title(resource)}</dt>
                  <dd className="small">{list.map((l) => title(l)).join(', ')}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="xs subtle" style={{ marginTop: 'var(--s4)' }}>
            Scope decides how far each permission reaches: <strong>own</strong> is only your records,
            <strong> team</strong> adds the people who report to you, <strong>department</strong> covers your
            whole department, and <strong>all</strong> is company-wide.
          </p>
        </Card>
      </div>
    </>
  );
}
