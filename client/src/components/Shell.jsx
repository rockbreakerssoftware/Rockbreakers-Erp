import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { IconButton, Avatar, useClickAway } from './ui';
import { useAuth, scopeFor } from '../lib/auth';

const NAV = [
  {
    group: null,
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/calendar', label: 'Work calendar', icon: 'calendar' },
      { to: '/jobs', label: 'Jobs', icon: 'briefcase', need: ['job', 'read'] },
      { to: '/attendance', label: 'Attendance', icon: 'clock' },
    ],
  },
  {
    group: 'Field',
    items: [
      { to: '/requirements', label: 'Requirements', icon: 'box', need: ['requirement', 'read'] },
      { to: '/expenses', label: 'Expenses', icon: 'receipt', need: ['expense', 'read'] },
    ],
  },
  {
    group: 'Master data',
    items: [
      { to: '/sites', label: 'Sites', icon: 'map', need: ['site', 'read'] },
      { to: '/customers', label: 'Customers', icon: 'building', need: ['customer', 'read'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: 'users', need: ['user', 'read'] },
      { to: '/roles', label: 'Roles & permissions', icon: 'shield', need: ['role', 'read'] },
      { to: '/departments', label: 'Departments', icon: 'building', need: ['department', 'read'] },
      { to: '/logs', label: 'Activity log', icon: 'list', need: ['log', 'read'] },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('rb-theme') || 'system');
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('rb-theme', theme); } catch { /* private mode */ }
  }, [theme]);
  return [theme, setTheme];
}

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useClickAway(() => setMenu(false));

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const visible = (item) => !item.need || scopeFor(user, item.need[0], item.need[1]) != null;

  const current = NAV.flatMap((g) => g.items).find(
    (i) => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to)),
  );

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">R</span>
          <div>
            <div className="brand-name">Rockbreakers</div>
            <div className="brand-sub">Field Service</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((group, gi) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={gi}>
                {group.group && <div className="nav-group-label">{group.group}</div>}
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Icon name={item.icon} size={16} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot" ref={menuRef} style={{ position: 'relative' }}>
          {menu && (
            <div className="card" style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 'var(--s3)', right: 'var(--s3)',
              boxShadow: 'var(--shadow)', zIndex: 10, padding: 'var(--s1)',
            }}>
              <button className="nav-item" style={{ color: 'var(--text)', width: '100%' }}
                onClick={() => { setMenu(false); navigate('/profile'); }}>
                <Icon name="user" size={15} /> My profile
              </button>
              <button className="nav-item" style={{ color: 'var(--bad)', width: '100%' }}
                onClick={() => { setMenu(false); logout(); }}>
                <Icon name="logout" size={15} /> Sign out
              </button>
            </div>
          )}
          <button className="side-user" onClick={() => setMenu((v) => !v)}>
            <Avatar name={user?.name} accent />
            <div className="grow truncate">
              <div className="side-user-name truncate">{user?.name}</div>
              <div className="side-user-role truncate">{user?.role?.name}</div>
            </div>
            <Icon name="chevronDown" size={14} style={{ color: '#596170' }} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Icon name="menu" size={18} />
          </button>
          <span className="strong only-mobile">{current?.label || 'Rockbreakers'}</span>
          <div className="grow" />
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
