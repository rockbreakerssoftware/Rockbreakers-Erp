import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import './styles/base.css';
import './styles/app.css';
import './styles/features.css';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot">
        <h1>Something broke on this page</h1>
        <p className="muted small" style={{ maxWidth: 420 }}>
          {this.state.error.message}
        </p>
        <button className="btn primary" onClick={() => window.location.assign('/')}>
          Back to dashboard
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
