import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

export type AccountUser = { _id: string; name: string; email: string; username: string; role: string; countryCode: string; mobile: string };
const TOKEN_KEY = 'habeshaline_token';
const AuthContext = createContext<{
  user: AccountUser | null; loading: boolean; error: string;
  authenticate: (mode: 'login' | 'register', data: Record<string, FormDataEntryValue>) => Promise<AccountUser>;
  logout: () => Promise<void>; refresh: (background?: boolean) => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh(background = false) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setUser(null); setError(''); setLoading(false); return; }
    if (!background) setLoading(true);
    try {
      const account = await api<AccountUser>('/auth/me', { auth: true });
      if (token === localStorage.getItem(TOKEN_KEY)) { setUser(account); setError(''); }
    } catch (e) {
      if (token === localStorage.getItem(TOKEN_KEY)) { setUser(null); setError((e as Error).message); }
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const clear = () => { setUser(null); setError(''); setLoading(false); };
    const storage = (event: StorageEvent) => { if (event.key === TOKEN_KEY || event.key === null) void refresh(); };
    const focus = () => { void refresh(true); };
    window.addEventListener('auth-expired', clear);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', focus);
    const timer = window.setInterval(() => { if (localStorage.getItem(TOKEN_KEY)) void refresh(true); }, 60000);
    return () => { window.removeEventListener('auth-expired', clear); window.removeEventListener('storage', storage); window.removeEventListener('focus', focus); window.clearInterval(timer); };
  }, []);
  async function authenticate(mode: 'login' | 'register', data: Record<string, FormDataEntryValue>) {
    const result = await api<{token: string; user: AccountUser}>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(data) });
    if (!result.token || !result.user?._id) throw new Error('The server returned an incomplete sign-in response.');
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user); setError(''); setLoading(false);
    return result.user;
  }
  async function logout() {
    // Keep the session if revocation fails, so the user can retry.
    if (localStorage.getItem(TOKEN_KEY)) await api('/auth/logout', { method: 'POST', auth: true });
    localStorage.removeItem(TOKEN_KEY); setUser(null); setError('');
  }
  return <AuthContext.Provider value={{ user, loading, error, authenticate, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <section className="section container" role="status">Checking your session…</section>;
  if (error) return <section className="section container"><p role="alert">{error}</p><button className="button" onClick={() => void refresh()}>Retry session check</button></section>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (admin && user.role !== 'admin') return <section className="section container"><h1>Access denied</h1><p>This page requires an administrator account.</p><a href="/account">Your account</a></section>;
  return <>{children}</>;
}

export function SignOutButton() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div><button className="text-link logout" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { await logout(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p className="error" role="alert">{error}</p>}</div>;
}
