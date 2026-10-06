import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Attendance from './pages/Attendance';
import Sites from './pages/Sites';
import Customers from './pages/Customers';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Departments from './pages/Departments';
import Expenses from './pages/Expenses';
import Requirements from './pages/Requirements';
import Logs from './pages/Logs';
import Payroll from './pages/Payroll';
import Profile from './pages/Profile';
import { Empty } from './components/ui';

function Boot({ message }) {
  return (
    <div className="boot">
      <span className="brand-mark" style={{ width: 34, height: 34, fontSize: 15 }}>R</span>
      <div className="row" style={{ gap: 8 }}>
        <span className="spinner" />
        <span className="small">{message}</span>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Render's free tier sleeps after 15 minutes of inactivity and takes about
  // a minute to wake, so the first load deserves an explanation rather than
  // a blank screen.
  if (loading) return <Boot message="Starting up — this can take a moment on first load" />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/requirements" element={<Requirements />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/users" element={<Users />} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={
          <Empty icon="alert" title="Page not found" text="That address does not match anything in this application." />
        } />
      </Routes>
    </Shell>
  );
}
