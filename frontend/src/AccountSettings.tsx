import { FormEvent, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export default function AccountSettings() {
  const { user, refresh } = useAuth();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, password = false) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (password && data.newPassword !== data.confirmPassword) { setNotice('New passwords do not match.'); return; }
    delete data.confirmPassword;
    setBusy(true); setNotice('');
    try {
      await api(password ? '/auth/password' : '/auth/me', { method: password ? 'POST' : 'PATCH', auth: true, body: JSON.stringify(data) });
      if (password) {
        localStorage.removeItem('habeshaline_token');
        window.dispatchEvent(new Event('auth-expired'));
      } else { setNotice('Profile saved.'); await refresh(true); }
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  if (!user) return null;
  return <div className="panel account-settings"><h2>Account settings</h2><p>{user.email} · {user.username}</p>{notice && <p role="status">{notice}</p>}
    <form className="form" onSubmit={event => void submit(event)}>
      <label htmlFor="profile-name">Full name</label><input id="profile-name" name="name" defaultValue={user.name} required maxLength={100} autoComplete="name"/>
      <label htmlFor="profile-country">Country code</label><input id="profile-country" name="countryCode" defaultValue={user.countryCode} required pattern="[A-Za-z]{2,3}"/>
      <label htmlFor="profile-mobile">Mobile</label><input id="profile-mobile" name="mobile" type="tel" defaultValue={user.mobile} required minLength={5} maxLength={25} autoComplete="tel"/>
      <button className="button" disabled={busy}>Save profile</button>
    </form>
    <h3>Change password</h3><p>Changing your password signs you out on all devices.</p>
    <form className="form" onSubmit={event => void submit(event, true)}>
      <label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" required autoComplete="current-password"/>
      <label htmlFor="new-password">New password</label><input id="new-password" name="newPassword" type="password" required minLength={15} maxLength={72} autoComplete="new-password"/>
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" required minLength={15} maxLength={72} autoComplete="new-password"/>
      <button className="button" disabled={busy}>Change password</button>
    </form>
  </div>;
}
