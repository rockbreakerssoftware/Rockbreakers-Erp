import MasterData from './MasterData';

export default function Customers() {
  return (
    <MasterData
      resource="customer"
      path="/customers"
      titleText="Customers"
      subtitle="The companies whose sites and machines you service"
      emptyIcon="building"
      emptyText="Add a customer, then add their sites — jobs are scheduled against sites."
      columns={[
        { key: 'name', label: 'Customer', render: (c) => <span className="cell-main">{c.name}</span> },
        { key: 'contactPerson', label: 'Contact', render: (c) => <span className="small">{c.contactPerson || '—'}</span> },
        { key: 'phone', label: 'Phone', render: (c) => <span className="small muted mono">{c.phone || '—'}</span> },
        { key: 'address', label: 'Address', render: (c) => <span className="small muted truncate">{c.address || '—'}</span> },
      ]}
      fields={[
        { key: 'name', label: 'Customer name', required: true, wide: true },
        { key: 'contactPerson', label: 'Contact person' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Address', wide: true, type: 'textarea' },
      ]}
    />
  );
}
