import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Banner } from '../components/ui';
import Icon from '../components/Icon';

const DEMO = [
  ['Super Admin', 'admin@rockbreakers.in'],
  ['Service Manager', 'manager@rockbreakers.in'],
  ['Engineer', 'amit@rockbreakers.in'],
  ['Accountant', 'accounts@rockbreakers.in'],
];

const POINTS = [
  ['calendar', 'One work calendar', 'Visits, installations and leave for every team, in one place.'],
  ['camera', 'Proof of presence', 'Geo-tagged selfies at the gate — not a tick box back at the office.'],
  ['receipt', 'Site-wise costing', 'Every expense tagged to a site and a category, so job cost is a query.'],
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const useDemo = (addr) => {
    setEmail(addr);
    setPassword('rockbreakers123');
  };

  return (
    <div className="login-wrap">
      <aside className="login-aside">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="brand-name">Rock<em>Breakers</em></div>
          <div className="brand-sub">Hydraulics</div>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Schedule the crew, prove the visit, settle the cost.</h2>
          <p>
            Built for machinery service teams who work on quarry sites, not at a desk.
          </p>
          <div className="login-points">
            {POINTS.map(([icon, t, d]) => (
              <div className="login-point" key={t}>
                <Icon name={icon} size={16} />
                <div>
                  <div style={{ color: '#fff', fontWeight: 500 }}>{t}</div>
                  <div className="xs" style={{ color: '#7c838f' }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xs" style={{ color: '#596170', position: 'relative', zIndex: 1 }}>
          © {new Date().getFullYear()} RockBreakers Hydraulics
        </div>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <div className="only-mobile" style={{ marginBottom: 'var(--s6)' }}>
            <div>
              <div className="login-wordmark">Rock<em>Breakers</em></div>
              <div className="xs muted" style={{ letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase' }}>
                Hydraulics
              </div>
            </div>
          </div>

          <h1>Sign in</h1>
          <p className="muted small" style={{ marginTop: 4, marginBottom: 'var(--s6)' }}>
            Use the account your administrator gave you.
          </p>

          {error && (
            <div style={{ marginBottom: 'var(--s4)' }}>
              <Banner tone="bad" icon="alert">{error}</Banner>
            </div>
          )}

          <form onSubmit={submit} className="col" style={{ gap: 'var(--s4)' }}>
            <Field label="Email address">
              <Input type="email" value={email} autoComplete="username" required autoFocus
                placeholder="you@rockbreakers.in" onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} autoComplete="current-password" required
                placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="block" loading={busy}>
              Sign in
            </Button>
          </form>

          <div className="login-demo">
            <div className="label-xs" style={{ marginBottom: 4 }}>Demo accounts · password rockbreakers123</div>
            {DEMO.map(([role, addr]) => (
              <div className="login-demo-row" key={addr} onClick={() => useDemo(addr)}>
                <span className="muted">{role}</span>
                <span className="mono">{addr}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
