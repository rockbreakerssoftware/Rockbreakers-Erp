import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useCan } from '../lib/auth';
import {
  Card, Table, Button, Search, Modal, Field, Input, Textarea, Empty, Skeleton,
  ConfirmModal, Banner, useToast,
} from '../components/ui';

/**
 * One screen shared by the simple master-data collections. Customers and
 * departments differ only in their fields, so they share everything else
 * rather than duplicating a list, a form and three modals each.
 */
export default function MasterData({ resource, path, titleText, subtitle, fields, columns, emptyIcon, emptyText }) {
  const can = useCan();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setRows(null);
    api.get(path, { q: q || undefined }).then(setRows).catch((e) => toast.error(e));
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const remove = async () => {
    try {
      await api.del(`${path}/${deleting._id}`);
      toast.ok('Removed');
      setDeleting(null);
      load();
    } catch (e) { toast.error(e); setDeleting(null); }
  };

  const allColumns = [
    ...columns,
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {can(resource, 'update') && <Button size="sm" icon="edit" aria-label="Edit"
            onClick={(e) => { e.stopPropagation(); setEditing(r); }} />}
          {can(resource, 'delete') && <Button size="sm" variant="danger" icon="trash" aria-label="Delete"
            onClick={(e) => { e.stopPropagation(); setDeleting(r); }} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">{titleText}</div>
          <div className="page-sub">{subtitle}</div>
        </div>
        {can(resource, 'create') && (
          <div className="page-actions">
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>Add</Button>
          </div>
        )}
      </div>

      <Card bodyClass="tight">
        <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
          <Search value={q} onChange={setQ} placeholder={`Search ${titleText.toLowerCase()}…`} />
          <span className="small muted">{rows?.length ?? ''}</span>
        </div>
        {!rows ? <Skeleton rows={5} /> : (
          <Table columns={allColumns} rows={rows}
            empty={<Empty icon={emptyIcon} title={q ? 'Nothing matches that search' : `No ${titleText.toLowerCase()} yet`}
              text={q ? undefined : emptyText} />} />
        )}
      </Card>

      {editing && (
        <RecordForm record={editing._id ? editing : null} fields={fields} path={path} titleText={titleText}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove}
        title={`Remove ${deleting?.name}?`} confirmLabel="Remove" danger
        message="The record is hidden from new entries but kept on historical ones. Records still in use cannot be removed." />
    </>
  );
}

function RecordForm({ record, fields, path, titleText, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!record;
  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, record?.[f.key] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setError(null);
    const missing = fields.find((f) => f.required && !String(form[f.key] || '').trim());
    if (missing) return setError(`${missing.label} is required.`);
    setBusy(true);
    try {
      if (editing) await api.put(`${path}/${record._id}`, form);
      else await api.post(path, form);
      toast.ok(editing ? 'Saved' : 'Added');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const label = titleText.replace(/s$/, '');

  return (
    <Modal
      open onClose={onClose} title={editing ? `Edit ${record.name}` : `Add ${label.toLowerCase()}`}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save changes' : 'Add'}</Button></>}
    >
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.hint}
            className={f.wide ? 'span-2' : ''}>
            {f.type === 'textarea'
              ? <Textarea value={form[f.key]} rows={3}
                  onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />
              : <Input type={f.type || 'text'} value={form[f.key]} placeholder={f.placeholder} autoFocus={f.key === fields[0].key}
                  onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />}
          </Field>
        ))}
      </div>
    </Modal>
  );
}
