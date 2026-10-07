import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
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
      { to: '/departments', label: 'Departments', icon: 'office', show: (u) => can(u, 'department', 'read') },
      { to: '/logs', label: 'Activity log', icon: 'list', show: (u) => can(u, 'log', 'read') },
    ],
  },
];

/* Routes an engineer uses all day, in the order they use them. The bottom bar
   takes the first four of these that the role can actually reach. */
const THUMB_ORDER = ['/', '/calendar', '/attendance', '/jobs', '/expenses', '/requirements', '/payroll'];

function useStickyState(key, initial) {
  const [value, setValue] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? initial : JSON.parse(v); }
    catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }, [key, value]);
  return [value, setValue];
}

function useTheme() {
  const [theme, setTheme] = useStickyState('rb-theme', 'system');
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useStickyState('rb-nav-collapsed', false);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useClickAway(useCallback(() => setMenu(false), []));

  useEffect(() => { setDrawer(false); setMenu(false); }, [location.pathname]);

  const groups = useMemo(
    () => NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.show || i.show(user)) }))
      .filter((g) => g.items.length),
    [user],
  );

  const flat = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group || 'General' }))),
    [groups],
  );

  const current = flat.find(
    (i) => i.to === location.pathname || (i.to !== '/' && location.pathname.startsWith(i.to)),
  );

  const thumbs = useMemo(() => {
    const byPath = Object.fromEntries(flat.map((i) => [i.to, i]));
    return THUMB_ORDER.map((p) => byPath[p]).filter(Boolean).slice(0, 4);
  }, [flat]);

  // Cmd/Ctrl+K opens "go to". Escape is handled inside the palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isDark = theme === 'dark';

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <aside className={`sidebar ${drawer ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand">
          {collapsed ? (
            <span className="brand-monogram">RB</span>
          ) : (
            <div className="brand-text">
              <div className="brand-name">Rock<em>Breakers</em></div>
              <div className="brand-sub">Hydraulics</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Sections">
          {groups.map((group, gi) => (
            <div className="nav-group" key={group.group || gi}>
              {group.group && <div className="nav-group-label">{group.group}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to} to={item.to} end={item.end} data-label={item.label}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="nav-item-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button
            className="side-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} size={16} />
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Icon name="menu" size={20} />
          </button>

          <nav className="crumbs hide-mobile" aria-label="Breadcrumb">
            <Link to="/">RockBreakers</Link>
            <span className="sep">/</span>
            {current?.group && current.group !== 'General' && (
              <>
                <span>{current.group}</span>
                <span className="sep">/</span>
              </>
            )}
            <span className="current">{current?.label || 'Not found'}</span>
          </nav>

          <span className="strong only-mobile truncate" style={{ fontSize: 'var(--text-base)' }}>
            {current?.label || 'Rockbreakers'}
          </span>

          <div className="grow" />

          <button className="go-to hide-mobile" onClick={() => setPalette(true)}>
            <Icon name="search" size={15} />
            <span className="grow">Go to…</span>
            <span className="kbd">Ctrl K</span>
          </button>

          <IconButton
            icon="search" label="Go to section" className="touch-only"
            onClick={() => setPalette(true)}
          />

          <IconButton
            icon={isDark ? 'sun' : 'moon'}
            label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          />

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="topbar-user" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
              <Avatar name={user?.name} accent />
              <span className="hide-mobile" style={{ textAlign: 'left' }}>
                <span className="topbar-user-name" style={{ display: 'block' }}>{user?.name}</span>
                <span className="topbar-user-role">{user?.role?.name}</span>
              </span>
              <Icon name="chevronDown" size={14} className="hide-mobile" />
            </button>

            {menu && (
              <div className="popover" role="menu">
                <div className="popover-head">
                  <div className="strong" style={{ fontSize: 'var(--text-sm)' }}>{user?.name}</div>
                  <div className="xs subtle truncate">{user?.email}</div>
                </div>
                <button className="popover-item" role="menuitem" onClick={() => navigate('/profile')}>
                  <Icon name="user" size={15} /> My profile
                </button>
                <button className="popover-item" role="menuitem"
                  onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}>
                  <Icon name={isDark ? 'sun' : 'moon'} size={15} />
                  Theme: {theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}
                </button>
                <button className="popover-item danger" role="menuitem" onClick={logout}>
                  <Icon name="logout" size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="page">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {thumbs.map((item) => {
          const active = item.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.to);
          return (
            <button
              key={item.to}
              className={`bottom-nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(item.to)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label === 'Work calendar' ? 'Calendar' : item.label}</span>
            </button>
          );
        })}
        <button className="bottom-nav-item" onClick={() => setDrawer(true)} aria-label="More sections">
          <Icon name="menu" size={19} />
          <span>More</span>
        </button>
      </nav>

      {palette && <Palette items={flat} onClose={() => setPalette(false)} />}
    </div>
  );
}

/**
 * Go-to palette. It moves between sections — it does not search records, and
 * is labelled so it does not imply otherwise.
 */
function Palette({ items, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle));
  }, [items, q]);

  useEffect(() => { setSel(0); }, [q]);

  const go = (item) => { if (item) { navigate(item.to); onClose(); } };

  const onKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
  };

  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go to section">
        <div className="palette-input">
          <Icon name="search" size={17} style={{ color: 'var(--text-subtle)' }} />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Go to a section…" aria-label="Go to a section"
          />
          <span className="kbd">Esc</span>
        </div>

        <div className="palette-list" role="listbox">
          {results.length ? results.map((item, i) => (
            <button
              key={item.to} className="palette-item" role="option" aria-selected={i === sel}
              onMouseEnter={() => setSel(i)} onClick={() => go(item)}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
              <span className="group">{item.group}</span>
            </button>
          )) : (
            <div className="small muted" style={{ padding: 'var(--sp-4)' }}>
              No section matches “{q}”.
            </div>
          )}
        </div>

        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> move</span>
          <span><span className="kbd">↵</span> open</span>
          <span className="right">Sections only — this does not search records</span>
        </div>
      </div>
    </div>
  );
}
