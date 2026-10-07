import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Icon from './Icon';
import { initials, title, statusTone } from '../lib/format';

/* ------------------------------------------------------------- buttons */

export function Button({ variant = '', size = '', icon, children, loading, className = '', ...rest }) {
  return (
    <button className={`btn ${variant} ${size} ${className}`.trim()} disabled={rest.disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, size = 16, className = '', ...rest }) {
  return (
    <button className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

/* -------------------------------------------------------------- fields */

export function Field({ label, required, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Textarea = (props) => <textarea className="textarea" {...props} />;

export function Select({ options = [], placeholder, children, ...rest }) {
  return (
    <select className="select" {...rest}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? title(o) : o.label;
        return <option key={value} value={value}>{label}</option>;
      })}
      {children}
    </select>
  );
}

export function Search({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search" style={{ minWidth: 200 }}>
      <Icon name="search" size={14} />
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export const Checkbox = ({ label, ...rest }) => (
  <label className="check"><input type="checkbox" {...rest} />{label}</label>
);

/* --------------------------------------------------------------- pills */

export function Pill({ tone = '', dot, children, className = '' }) {
  return (
    <span className={`pill ${tone} ${className}`.trim()}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export const StatusPill = ({ status, dot = true }) => (
  <Pill tone={statusTone(status)} dot={dot}>{title(status)}</Pill>
);

export function Avatar({ name, size = '', accent }) {
  return <span className={`avatar ${size} ${accent ? 'accent' : ''}`.trim()} title={name}>{initials(name)}</span>;
}

export function AvatarStack({ people = [], max = 4 }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="avatar-stack">
      {shown.map((p, i) => <Avatar key={p?._id || i} name={p?.name} size="sm" />)}
      {rest > 0 && <span className="avatar sm" title={`${rest} more`}>+{rest}</span>}
    </div>
  );
}

/* --------------------------------------------------------------- cards */

export function Card({ title: t, subtitle, actions, children, bodyClass = '', className = '', pad = true }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(t || actions) && (
        <header className="card-head">
          <div className="card-head-text">
            {t && <h2 className="card-title">{t}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="row card-head-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${pad ? '' : 'flush'} ${bodyClass}`.trim()}>{children}</div>
    </section>
  );
}

/**
 * A KPI tile. `tier` gives the grid a hierarchy instead of thirteen identical
 * boxes: "lead" is the number someone opened the page for, "default" supports
 * it, "quiet" is reference data that should recede.
 */
export function Stat({ label, value, hint, tone = '', tier = 'default', trend, icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const dir = trend?.direction;
  return (
    <Tag
      className={`stat tier-${tier} ${tone ? `tone-${tone}` : ''} ${onClick ? 'is-link' : ''}`.trim()}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <span className="stat-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </span>
      <span className="stat-row">
        <span className="stat-value">{value}</span>
        {trend && (
          <span className={`stat-trend ${dir || 'flat'}`}>
            <Icon name={dir === 'up' ? 'trendUp' : dir === 'down' ? 'trendDown' : 'trendFlat'} size={13} />
            {trend.label}
          </span>
        )}
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </Tag>
  );
}

export function Banner({ tone = 'info', icon = 'info', children, actions }) {
  return (
    <div className={`banner ${tone}`}>
      <Icon name={icon} size={15} />
      <div className="grow">{children}</div>
      {actions}
    </div>
  );
}

/* --------------------------------------------------------------- modal */

export function Modal({ open, onClose, title: t, children, footer, width = '' }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${width}`.trim()} role="dialog" aria-modal="true" aria-label={t}>
        <header className="modal-head">
          <h2 className="modal-title">{t}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title: t, message, confirmLabel = 'Confirm', danger, requireReason }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(''); setBusy(false); } }, [open]);

  const go = async () => {
    setBusy(true);
    try { await onConfirm(reason); } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} title={t}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={go} loading={busy}
            disabled={requireReason && !reason.trim()}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 'var(--fs-md)' }}>{message}</p>
      {requireReason && (
        <div style={{ marginTop: 'var(--s4)' }}>
          <Field label="Reason" required hint="This is written to the activity log.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this happening?" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------ empty & loading */

/**
 * Empty state. Compact by default — an empty list is a normal condition, not
 * an event, and should not take 400px to say so. `size="page"` is for a whole
 * screen with nothing in it.
 */
export function Empty({ icon = 'inbox', title: t = 'Nothing here yet', text, action, size = 'compact' }) {
  return (
    <div className={`empty empty-${size}`}>
      <span className="empty-icon"><Icon name={icon} size={size === 'page' ? 20 : 16} /></span>
      <span className="empty-text-group">
        <span className="empty-title">{t}</span>
        {text && <span className="empty-text">{text}</span>}
      </span>
      {action && <span className="empty-action">{action}</span>}
    </div>
  );
}

export function Skeleton({ rows = 5 }) {
  return (
    <div className="col" style={{ gap: 'var(--s3)', padding: 'var(--s2) 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${92 - i * 7}%`, height: 13 }} />
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat"><div className="skeleton" style={{ width: '55%' }} /><div className="skeleton" style={{ width: '35%', height: 24, marginTop: 6 }} /></div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- toast */

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = '') => {
    const id = Math.random().toString(36).slice(2);
    setItems((v) => [...v, { id, message, tone }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 5000);
  }, []);
  const toast = {
    show: push,
    ok: (m) => push(m, 'ok'),
    error: (m) => push(typeof m === 'string' ? m : m?.message || 'Something went wrong', 'bad'),
  };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === 'bad' ? 'alert' : t.tone === 'ok' ? 'check' : 'info'} size={15} />
            <span className="grow">{t.message}</span>
            <button onClick={() => setItems((v) => v.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------------------------------------------------------------- tabs */

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${value === t.key ? 'on' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- table */

/**
 * Data table.
 *
 * On phones it does not transpose every column into a label/value row — that
 * produced six rows per person with "Department: Service" above
 * "Designation: Service Engineer". Instead a column can be marked `primary`
 * (the card's heading), `secondary` (its sub-line) or `hideOnMobile`, and
 * what is left renders as compact pairs. A page can override the whole thing
 * with `card`.
 */
export function Table({
  columns,
  rows,
  onRowClick,
  empty,
  stack = true,
  keyField = '_id',
  sortable = false,
  pageSize = 0,
  card,
  dense = false,
}) {
  const [sort, setSort] = useState(null);     // { key, dir }
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [rows?.length, sort]);

  const sorted = useMemo(() => {
    if (!rows) return rows;
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => {
      const v = r[col.key];
      return v && typeof v === 'object' ? (v.name ?? v.title ?? '') : v;
    });
    const out = [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);

  const pages = pageSize ? Math.ceil((sorted?.length || 0) / pageSize) : 1;
  const visible = pageSize && sorted ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  if (!rows?.length) return empty || <Empty />;

  const toggleSort = (key) => setSort((s) =>
    !s || s.key !== key ? { key, dir: 'asc' }
      : s.dir === 'asc' ? { key, dir: 'desc' }
        : null);

  const primary = columns.find((c) => c.primary) || columns[0];
  const secondary = columns.find((c) => c.secondary);
  const pairs = columns.filter(
    (c) => c !== primary && c !== secondary && c.key !== 'actions' && !c.hideOnMobile,
  );
  const actionsCol = columns.find((c) => c.key === 'actions');

  return (
    <>
      <div className="table-wrap">
        <table className={`tbl ${dense ? 'dense' : ''}`.trim()}>
          <thead>
            <tr>
              {columns.map((c) => {
                const canSort = sortable && c.sortable !== false && c.key !== 'actions';
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`${c.align === 'right' ? 'num' : ''} ${canSort ? 'sortable' : ''}`.trim()}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {canSort ? (
                      <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        <Icon name={active ? (sort.dir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sort'} size={12} />
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r[keyField]}
                className={onRowClick ? 'clickable' : ''}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-label={c.label}
                    className={c.key === 'actions' ? 'actions' : c.align === 'right' ? 'num' : ''}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stack && (
        <div className="row-cards">
          {visible.map((r) => card ? (
            <div key={r[keyField]} className="row-card" onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {card(r)}
            </div>
          ) : (
            <div key={r[keyField]} className="row-card" onClick={onRowClick ? () => onRowClick(r) : undefined}>
              <div className="row-card-head">
                <div className="grow" style={{ minWidth: 0 }}>
                  {primary.render ? primary.render(r) : r[primary.key]}
                  {secondary && (
                    <div className="row-card-sub">{secondary.render ? secondary.render(r) : r[secondary.key]}</div>
                  )}
                </div>
              </div>
              {pairs.length > 0 && (
                <dl className="row-card-pairs">
                  {pairs.map((c) => (
                    <div key={c.key} className={c.wide ? 'wide' : undefined}>
                      <dt>{c.label}</dt>
                      <dd>{c.render ? c.render(r) : r[c.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {actionsCol && <div className="row-card-actions">{actionsCol.render(r)}</div>}
            </div>
          ))}
        </div>
      )}

      {pageSize > 0 && pages > 1 && (
        <div className="pager">
          <span className="small muted">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="row" style={{ gap: 'var(--sp-1)' }}>
            <Button size="sm" icon="chevronLeft" aria-label="Previous page"
              disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
            <span className="small muted" style={{ padding: '0 var(--sp-2)' }}>
              Page {page + 1} of {pages}
            </span>
            <Button size="sm" icon="chevronRight" aria-label="Next page"
              disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} />
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------ gallery */

export function Lightbox({ src, caption, onClose }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!src) return null;
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-bar">
        <span className="small">{caption}</span>
        <IconButton icon="x" label="Close" onClick={onClose} style={{ color: '#fff' }} />
      </div>
      <img src={src} alt={caption || 'Photo'} />
    </div>
  );
}

/** Dismiss-on-outside-click helper for small popovers. */
export function useClickAway(onAway) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onAway]);
  return ref;
}
