import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useCan } from '../lib/auth';
import {
  Card, Table, Button, Search, Modal, Field, Input, Select, Textarea, Pill,
  Empty, Skeleton, ConfirmModal, Banner, useToast,
} from '../components/ui';
import Icon from '../components/Icon';
import Map from '../components/Map';

export default function Sites() {
  const can = useCan();
  const toast = useToast();
  const [sites, setSites] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setSites(null);
    api.get('/sites', { q: q || undefined }).then(setSites).catch((e) => toast.error(e));
  };

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  useEffect(() => { api.get('/customers').then(setCustomers).catch(() => {}); }, []);

  const remove = async () => {
    try {
      await api.del(`/sites/${deleting._id}`);
      toast.ok('Site removed');
      setDeleting(null);
      load();
    } catch (e) { toast.error(e); setDeleting(null); }
  };

  const columns = [
    {
      key: 'name', label: 'Site',
      render: (s) => (
        <div style={{ minWidth: 0 }}>
          <div className="cell-main truncate">{s.name}</div>
          <div className="cell-sub truncate">{s.address || s.city || '—'}</div>
        </div>
      ),
    },
    { key: 'customer', label: 'Customer', render: (s) => <span className="small">{s.customer?.name || '—'}</span> },
    { key: 'city', label: 'City', render: (s) => <span className="small muted">{s.city || '—'}</span> },
    {
      key: 'machines', label: 'Machines', align: 'right',
      render: (s) => <span className="num small">{s.machines?.length || 0}</span>,
    },
    {
      key: 'geo', label: 'Location',
      render: (s) => (s.location?.lat
        ? <Pill tone="ok" dot>{s.geofenceRadius} m fence</Pill>
        : <Pill tone="warn" dot>No coordinates</Pill>),
    },
    {
      key: 'actions', label: '',
      render: (s) => (
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {can('site', 'update') && <Button size="sm" icon="edit" aria-label={`Edit ${s.name}`}
            onClick={(e) => { e.stopPropagation(); setEditing(s); }} />}
          {can('site', 'delete') && <Button size="sm" variant="danger" icon="trash" aria-label={`Delete ${s.name}`}
            onClick={(e) => { e.stopPropagation(); setDeleting(s); }} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Sites</div>
          <div className="page-sub">
            Customer locations. The coordinates here are what every site check-in is measured against.
          </div>
        </div>
        {can('site', 'create') && (
          <div className="page-actions">
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>Add site</Button>
          </div>
        )}
      </div>

      {sites?.some((s) => !s.location?.lat) && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Banner tone="warn" icon="alert">
            Some sites have no coordinates. Check-ins at those sites cannot be verified against a boundary
            until a location is set.
          </Banner>
        </div>
      )}

      <Card bodyClass="tight">
        <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
          <Search value={q} onChange={setQ} placeholder="Search sites…" />
          <span className="small muted">{sites?.length ?? ''} sites</span>
        </div>
        {!sites ? <Skeleton rows={6} /> : (
          <Table columns={columns} rows={sites}
            empty={<Empty icon="map" title={q ? 'No sites match' : 'No sites yet'}
              text="Every job is scheduled against a site, so start here." />} />
        )}
      </Card>

      {editing && (
        <SiteForm site={editing._id ? editing : null} customers={customers}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove}
        title={`Remove ${deleting?.name}?`} confirmLabel="Remove site" danger
        message="The site is hidden from new work but kept on historical jobs. Sites with open jobs cannot be removed." />
    </>
  );
}

function SiteForm({ site, customers, onClose, onSaved }) {
  const toast = useToast();
  const editing = !!site;
  const [form, setForm] = useState(() => ({
    name: site?.name || '',
    code: site?.code || '',
    customer: site?.customer?._id || site?.customer || '',
    address: site?.address || '',
    city: site?.city || '',
    state: site?.state || '',
    contactPerson: site?.contactPerson || '',
    contactPhone: site?.contactPhone || '',
    geofenceRadius: site?.geofenceRadius ?? 300,
  }));
  const [location, setLocation] = useState(site?.location?.lat ? site.location : null);
  const [machines, setMachines] = useState(site?.machines || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const useMyLocation = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLocation({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
        setLocating(false);
      },
      () => { toast.error('Could not read your location'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Give the site a name.');
    setBusy(true);
    try {
      const body = {
        ...form,
        geofenceRadius: Number(form.geofenceRadius) || 300,
        customer: form.customer || undefined,
        location: location || undefined,
        machines: machines.filter((m) => m.name?.trim()),
      };
      if (editing) await api.put(`/sites/${site._id}`, body);
      else await api.post('/sites', body);
      toast.ok(editing ? 'Site updated' : 'Site added');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} width="wide" title={editing ? `Edit ${site.name}` : 'Add a site'}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy}>{editing ? 'Save changes' : 'Add site'}</Button></>}
    >
      {error && <div style={{ marginBottom: 'var(--s4)' }}><Banner tone="bad" icon="alert">{error}</Banner></div>}

      <div className="form-grid">
        <Field label="Site name" required><Input value={form.name} onChange={set('name')} autoFocus placeholder="e.g. Wagholi Quarry" /></Field>
        <Field label="Site code"><Input value={form.code} onChange={set('code')} placeholder="WGH-01" /></Field>
        <Field label="Customer" className="span-2">
          <Select value={form.customer} onChange={set('customer')} placeholder="No customer linked"
            options={customers.map((c) => ({ value: c._id, label: c.name }))} />
        </Field>
        <Field label="Address" className="span-2"><Input value={form.address} onChange={set('address')} /></Field>
        <Field label="City"><Input value={form.city} onChange={set('city')} /></Field>
        <Field label="State"><Input value={form.state} onChange={set('state')} /></Field>
        <Field label="Site contact"><Input value={form.contactPerson} onChange={set('contactPerson')} /></Field>
        <Field label="Contact phone"><Input value={form.contactPhone} onChange={set('contactPhone')} /></Field>
      </div>

      <hr className="divider" />

      <div className="row-b" style={{ marginBottom: 'var(--s3)' }}>
        <div>
          <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>Location &amp; geofence</div>
          <div className="xs subtle">Click the map to drop the site centre, or use your current position if you are standing there.</div>
        </div>
        <Button size="sm" icon="mapPin" onClick={useMyLocation} loading={locating}>Use my location</Button>
      </div>

      <Map
        size="sm"
        center={location}
        onPick={setLocation}
        markers={location ? [{ ...location, label: 'S' }] : []}
        circle={location ? { ...location, radius: Number(form.geofenceRadius) || 300 } : null}
      />

      <div className="form-grid" style={{ marginTop: 'var(--s3)' }}>
        <Field label="Latitude">
          <Input value={location?.lat ?? ''} placeholder="Click the map"
            onChange={(e) => setLocation((l) => ({ ...(l || {}), lat: Number(e.target.value) }))} />
        </Field>
        <Field label="Longitude">
          <Input value={location?.lng ?? ''} placeholder="Click the map"
            onChange={(e) => setLocation((l) => ({ ...(l || {}), lng: Number(e.target.value) }))} />
        </Field>
        <Field label="Geofence radius (metres)" className="span-2"
          hint="Check-ins beyond this distance are flagged for review, never blocked. Quarry sites need a generous radius.">
          <Input type="number" min="50" step="50" value={form.geofenceRadius} onChange={set('geofenceRadius')} />
        </Field>
      </div>

      <hr className="divider" />

      <div className="row-b" style={{ marginBottom: 'var(--s2)' }}>
        <span className="strong" style={{ fontSize: 'var(--fs-md)' }}>Machines on site</span>
        <Button size="sm" icon="plus" onClick={() => setMachines((m) => [...m, { name: '', model: '', serialNo: '' }])}>
          Add machine
        </Button>
      </div>

      {machines.length ? machines.map((m, i) => (
        <div className="row" style={{ gap: 'var(--s2)', marginBottom: 'var(--s2)' }} key={i}>
          <Input value={m.name} placeholder="Machine" className="grow"
            onChange={(e) => setMachines((l) => l.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} />
          <Input value={m.model} placeholder="Model" style={{ width: 110 }}
            onChange={(e) => setMachines((l) => l.map((x, n) => (n === i ? { ...x, model: e.target.value } : x)))} />
          <Input value={m.serialNo} placeholder="Serial no." style={{ width: 120 }}
            onChange={(e) => setMachines((l) => l.map((x, n) => (n === i ? { ...x, serialNo: e.target.value } : x)))} />
          <Button variant="ghost" icon="x" aria-label="Remove machine"
            onClick={() => setMachines((l) => l.filter((_, n) => n !== i))} />
        </div>
      )) : <p className="small muted">No machines recorded on this site yet.</p>}
    </Modal>
  );
}
