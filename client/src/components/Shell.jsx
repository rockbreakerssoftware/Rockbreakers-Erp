import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { IconButton, Avatar, useClickAway } from './ui';
import { useAuth, scopeFor } from '../lib/auth';

/**
 * Navigation is gated on what a role actually works in, which is not the same
 * as what it can read. An engineer holds site:read so the expense form can
 * offer a site list, but sites are not something they maintain — so the
 * master-data sections ask for a manage permission (create or update) rather
 * than read. Everything else asks for the read that matches its page.
 */
const can = (user, resource, action) => scopeFor(user, resource, action) != null;
const manages = (resource) => (u) => can(u, resource, 'create') || can(u, resource, 'update');

const NAV = [
  {
    group: null,
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
      { to: '/calendar', label: 'Work calendar', icon: 'calendar' },
      { to: '/jobs', label: 'Jobs', icon: 'briefcase', show: (u) => can(u, 'job', 'read') },
      { to: '/attendance', label: 'Attendance', icon: 'clock' },
    ],
  },
  {
    group: 'Field',
    items: [
      { to: '/requirements', label: 'Requirements', icon: 'box', show: (u) => can(u, 'requirement', 'read') },
      { to: '/expenses', label: 'Expenses', icon: 'receipt', show: (u) => can(u, 'expense', 'read') },
    ],
  },
  {
    group: 'People & pay',
    items: [
      { to: '/payroll', label: 'Salary & attendance', icon: 'chart', show: (u) => can(u, 'payroll', 'read') },
      { to: '/users', label: 'Employees', icon: 'users', show: manages('user') },
    ],
  },
  {
    group: 'Master data',
    items: [
      { to: '/sites', label: 'Sites', icon: 'map', show: manages('site') },
      { to: '/customers', label: 'Customers', icon: 'building', show: manages('customer') },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/roles', label: 'Roles & permissions', icon: 'shield', show: (u) => can(u, 'role', 'read') },
      { to: '/departments', label: 'Departments', icon: 'building', show: (u) => can(u, 'department', 'read') },
      { to: '/logs', label: 'Activity log', icon: 'list', show: (u) => can(u, 'log', 'read') },
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

  const visible = (item) => !item.show || item.show(user);

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
