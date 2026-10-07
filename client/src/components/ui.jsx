import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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

export function Card({ title: t, subtitle, actions, children, bodyClass = '', className = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(t || actions) && (
        <header className="card-head">
          <div>
            <div className="card-title">{t}</div>
            {subtitle && <div className="small muted">{subtitle}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${bodyClass}`.trim()}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className={`stat tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${typeof value === 'string' && value.length > 6 ? 'sm' : ''}`}>{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
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

export function Empty({ icon = 'inbox', title: t = 'Nothing here yet', text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={19} /></div>
      <div className="empty-title">{t}</div>
      {text && <p className="empty-text">{text}</p>}
      {action && <div style={{ marginTop: 'var(--s2)' }}>{action}</div>}
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

export function Table({ columns, rows, onRowClick, empty, stack = true, keyField = '_id' }) {
  if (!rows?.length) return empty || <Empty />;
  return (
    <div className="table-wrap">
      <table className={`tbl ${stack ? 'stack' : ''}`.trim()}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[keyField]} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.key === 'actions' ? 'actions' : c.align === 'right' ? 'num' : ''}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
