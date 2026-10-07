export const JOB_TYPES = ['INSPECTION', 'BREAKDOWN', 'PREVENTIVE', 'INSTALLATION', 'TRAINING'];
export const JOB_STATUS = ['DRAFT', 'SCHEDULED', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'WORK_DONE', 'CLOSED', 'CANCELLED'];
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
export const EXPENSE_CATEGORIES = ['TRAVEL', 'FOOD', 'LODGING', 'TOLL', 'FUEL', 'CONSUMABLE', 'OTHER'];

/** Legal next statuses, mirroring the server's transition table. */
export const NEXT_STATUS = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['WORK_DONE', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED'],
  WORK_DONE: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

export const title = (s) =>
  !s ? '' : String(s).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const statusTone = (s) => ({
  SCHEDULED: 'info', ACCEPTED: 'info', IN_PROGRESS: 'accent', ON_HOLD: 'warn',
  WORK_DONE: 'ok', CLOSED: '', CANCELLED: '', DRAFT: '',
  SUBMITTED: 'info', MANAGER_APPROVED: 'info', VERIFIED: 'accent',
  REIMBURSED: 'ok', REJECTED: 'bad', APPROVED: 'ok', PENDING: 'warn',
  FULFILLED: 'ok', IN_PURCHASE: 'accent', REQUESTED: 'warn',
}[s] ?? '');

export const priorityTone = (p) => ({ URGENT: 'bad', HIGH: 'warn', NORMAL: '', LOW: '' }[p] ?? '');

/** Work type carries its own urgency; a breakdown should not scan as a survey. */
export const typeTone = (t) => ({
  BREAKDOWN: 'bad', INSTALLATION: 'accent', PREVENTIVE: 'info',
  INSPECTION: '', TRAINING: '',
}[t] ?? '');

/* ------------------------------------------------------------- dates */

const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const fmtDate = (d, opts) =>
  !d ? '—' : new Date(d).toLocaleDateString('en-IN', opts || { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtDay = (d) =>
  !d ? '—' : new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtTime = (d) =>
  !d ? '—' : new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export const fmtDateTime = (d) => (!d ? '—' : `${fmtDate(d)}, ${fmtTime(d)}`);

/** For <input type="datetime-local">, which needs local time without a zone. */
export const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

export const fmtRange = (a, b) => {
  if (!a) return '—';
  const s = new Date(a); const e = new Date(b || a);
  const sameDay = dateKey(s) === dateKey(e);
  if (sameDay) return `${fmtDay(s)} · ${fmtTime(s)}–${fmtTime(e)}`;
  return `${fmtDay(s)} – ${fmtDay(e)}`;
};

export const daysBetween = (a, b) =>
  Math.max(1, Math.round((new Date(dateKey(b)) - new Date(dateKey(a))) / 864e5) + 1);

export const relative = (d) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 7) return `${days}d ago`;
  return fmtDate(d);
};

export const money = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const hours = (mins) => (mins == null ? '—' : `${(mins / 60).toFixed(1)} h`);

export const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const startOfWeek = (d) => {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
};

export const startOfMonth = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
