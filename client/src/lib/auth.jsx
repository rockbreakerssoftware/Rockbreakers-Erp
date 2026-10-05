import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const u = await api.post('/auth/login', { email, password });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

const SCOPES = ['own', 'team', 'department', 'all'];

/**
 * Mirrors the server's permission check so the UI can hide what a user
 * cannot do. The server still enforces every one of these — this is for
 * tidiness, never for security.
 */
export function scopeFor(user, resource, action) {
  const perms = user?.role?.permissions || [];
  if (perms.includes('*')) return 'all';
  let best = null;
  for (const p of perms) {
    const [r, a, s] = p.split(':');
    if ((r === resource || r === '*') && (a === action || a === '*')) {
      if (best === null || SCOPES.indexOf(s) > SCOPES.indexOf(best)) best = s;
    }
  }
  return best;
}

export function useCan() {
  const { user } = useAuth();
  return useCallback(
    (resource, action) => scopeFor(user, resource, action) != null,
    [user],
  );
}
