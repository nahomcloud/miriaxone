import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { authenticate, user, loading } = useAuth();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const registering = mode === 'register';
  if (loading) return <section className="section container" role="status">Checking your session…</section>;
  if (user) {
    const from = location.state?.from;
    const target = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\') && !from.startsWith('/login') && !from.startsWith('/register') && (user.role === 'admin' || !from.startsWith('/admin'))
      ? from : user.role === 'admin' ? '/admin' : '/account';
    return <Navigate to={target} replace/>;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (registering && data.password !== data.confirmPassword) { setError('Passwords do not match.'); return; }
    delete data.confirmPassword;
    setBusy(true); setError('');
    try { await authenticate(mode, data); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="auth"><div className="panel auth-card">
    <Link to="/" className="brand"><span>MIRIAX <span>ONE</span></span></Link>
    <span className="eyebrow">{registering ? 'Join MIRIAX ONE' : 'Welcome back'}</span>
    <h1>{registering ? 'Create your account' : 'Sign in to your account'}</h1>
    <form className="form" onSubmit={submit}>
      {registering && <>
        <label htmlFor="auth-name">Full name</label><input id="auth-name" name="name" required maxLength={100} autoComplete="name"/>
        <label htmlFor="auth-username">Username</label><input id="auth-username" name="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9]+" autoComplete="username"/>
        <div className="two"><div><label htmlFor="auth-country">Country code</label><input id="auth-country" name="countryCode" required placeholder="e.g. US" pattern="[A-Za-z]{2,3}"/></div>
          <div><label htmlFor="auth-mobile">Mobile</label><input id="auth-mobile" name="mobile" type="tel" required minLength={5} maxLength={25} autoComplete="tel"/></div></div>
      </>}
      <label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" required maxLength={254} autoComplete={registering ? 'email' : 'username'}/>
      <label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" minLength={registering ? 15 : 1} maxLength={72} required autoComplete={registering ? 'new-password' : 'current-password'}/>
      {registering && <><small>Use at least 15 characters.</small><label htmlFor="auth-confirm">Confirm password</label><input id="auth-confirm" name="confirmPassword" type="password" required minLength={15} maxLength={72} autoComplete="new-password"/></>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button full" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
    </form>
    <p>{registering ? 'Already have an account? ' : 'New here? '}<Link to={registering ? '/login' : '/register'} state={location.state}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
  </div></section>;
}

