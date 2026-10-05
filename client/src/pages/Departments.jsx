import MasterData from './MasterData';
import { Pill } from '../components/ui';

export default function Departments() {
  return (
    <MasterData
      resource="department"
      path="/departments"
      titleText="Departments"
      subtitle="Departments scope what a manager can see — the hierarchy is data, not code"
      emptyIcon="building"
      emptyText="Departments let one Manager role serve every team without cloning it."
      columns={[
        { key: 'name', label: 'Department', render: (d) => <span className="cell-main">{d.name}</span> },
        { key: 'key', label: 'Key', render: (d) => <Pill>{d.key}</Pill> },
        { key: 'description', label: 'Description', render: (d) => <span className="small muted truncate">{d.description || '—'}</span> },
      ]}
      fields={[
        { key: 'name', label: 'Department name', required: true, wide: true },
        { key: 'description', label: 'Description', wide: true, type: 'textarea' },
      ]}
    />
  );
}
