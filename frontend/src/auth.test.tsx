import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, SignOutButton, useAuth } from './auth';
import App from './App';
import AccountSettings from './AccountSettings';

const account = { _id: 'test-id', email: 'user@example.com', name: 'Test User', username: 'testuser', role: 'user', countryCode: 'US', mobile: '123456789' };
const fetchMock = vi.fn();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function mount(path = '/account', admin = false) {
  return render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/login" element={<h1>Sign in screen</h1>}/>
    <Route path="/account" element={<RequireAuth><h1>Private account</h1><SignOutButton/></RequireAuth>}/>
    <Route path="/admin" element={<RequireAuth admin={admin}><h1>Private admin</h1></RequireAuth>}/>
  </Routes></AuthProvider></MemoryRouter>);
}
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('scrollTo', vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Session and route protection', () => {
  it('redirects anonymous customers and admins to login without rendering private content', async () => {
    mount('/admin', true);
    await screen.findByText('Sign in screen');
    expect(screen.queryByText('Private admin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('waits for server verification before rendering an account', async () => {
    localStorage.setItem('habeshaline_token', 'token');
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
    mount();
    expect(screen.queryByText('Private account')).toBeNull();
    resolve(json(account));
    await screen.findByText('Private account');
  });
  it('denies admin access to a verified customer', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockResolvedValue(json(account));
    mount('/admin', true);
    await screen.findByText('Access denied');
    expect(screen.queryByText('Private admin')).toBeNull();
  });
  it('allows a server-verified administrator', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockResolvedValue(json({ ...account, role: 'admin' }));
    mount('/admin', true);
    await screen.findByText('Private admin');
  });
  it('clears an expired token and redirects', async () => {
    localStorage.setItem('habeshaline_token', 'expired'); fetchMock.mockResolvedValue(json({ detail: 'Expired token' }, 401));
    mount();
    await screen.findByText('Sign in screen');
    expect(localStorage.getItem('habeshaline_token')).toBeNull();
  });
  it('keeps a token on network failure and provides retry', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(json(account));
    mount();
    await screen.findByText('Network unavailable');
    expect(localStorage.getItem('habeshaline_token')).toBe('token');
    fireEvent.click(screen.getByText('Retry session check'));
    await screen.findByText('Private account');
  });
  it('revokes the server session before clearing local state', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockResolvedValueOnce(json(account)).mockResolvedValueOnce(json({ message: 'Signed out' }));
    mount();
    fireEvent.click(await screen.findByText('Sign out'));
    await screen.findByText('Sign in screen');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/logout');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(localStorage.getItem('habeshaline_token')).toBeNull();
  });
  it('offers retry when logout cannot revoke the session', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockResolvedValueOnce(json(account)).mockRejectedValueOnce(new Error('Logout unavailable'));
    mount(); fireEvent.click(await screen.findByText('Sign out'));
    await screen.findByText('Logout unavailable');
    expect(localStorage.getItem('habeshaline_token')).toBe('token');
    expect(screen.queryByText('Private account')).not.toBeNull();
  });
  it('synchronizes logout from another tab', async () => {
    localStorage.setItem('habeshaline_token', 'token'); fetchMock.mockResolvedValue(json(account));
    mount(); await screen.findByText('Private account');
    localStorage.removeItem('habeshaline_token');
    fireEvent(window, new StorageEvent('storage', { key: 'habeshaline_token', newValue: null }));
    await screen.findByText('Sign in screen');
  });
});

describe('Login and registration screens', () => {
  function app(path = '/login') { return render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={[path]}><AuthProvider><App/></AuthProvider></MemoryRouter>); }
  function fill(container: HTMLElement) {
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: 'user@example.com' } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: 'Test-password-123!' } });
    fireEvent.submit(container.querySelector('form')!);
  }
  it('does not treat a missing token as a successful login', async () => {
    fetchMock.mockResolvedValue(json({ user: account }));
    const { container } = app(); fill(container);
    await screen.findByText('The server returned an incomplete sign-in response.');
    expect(localStorage.getItem('habeshaline_token')).toBeNull();
  });
  it('shows readable API validation errors', async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ msg: 'Password is too short' }] }, 422));
    const { container } = app(); fill(container);
    await screen.findByText('Password is too short');
  });
  it('sends customers to their own order history', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/auth/login') ? { token: 'new-token', user: account } : [])));
    const { container } = app(); fill(container);
    await screen.findByText('Shipment dashboard');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/account/orders')).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/order')).toBe(false);
  });
  it('sends admins to the admin console after login', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/auth/login') ? { token: 'new-token', user: { ...account, role: 'admin' } } : url.includes('/admin/') ? {items:[],totalRecords:0,page:1,pageSize:25} : [])));
    const { container } = app(); fill(container);
    await screen.findByText('ADMIN CONSOLE');
  });
  it('registers a customer and omits password confirmation from the API request', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/auth/register') ? { token: 'new-token', user: account } : [])));
    const { container } = app('/register');
    for (const [name, value] of Object.entries({ name: 'Test User', username: 'testuser', countryCode: 'US', mobile: '123456789', email: 'user@example.com', password: 'Test-password-123!', confirmPassword: 'Test-password-123!' })) {
      fireEvent.change(container.querySelector(`input[name="${name}"]`)!, { target: { value } });
    }
    fireEvent.submit(container.querySelector('form')!);
    await screen.findByText('Shipment dashboard');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).confirmPassword).toBeUndefined();
  });
  it('does not submit mismatched registration passwords', async () => {
    const { container } = app('/register'); fill(container);
    await screen.findByText('Passwords do not match.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Account settings', () => {
  function settings() {
    localStorage.setItem('habeshaline_token', 'token');
    return render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={['/account']}><AuthProvider><Routes>
      <Route path="/account" element={<RequireAuth><AccountSettings/></RequireAuth>}/>
      <Route path="/login" element={<h1>Sign in again</h1>}/>
    </Routes></AuthProvider></MemoryRouter>);
  }
  it('saves profile fields and refreshes the displayed identity', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(account)));
    settings();
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Updated Name' } });
    fireEvent.click(screen.getByText('Save profile'));
    await screen.findByText('Profile saved.');
    const request = fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH');
    expect(JSON.parse(request![1].body)).toEqual({ name: 'Updated Name', countryCode: 'US', mobile: '123456789' });
  });
  it('rejects mismatched passwords without calling the password endpoint', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(account)));
    const { container } = settings();
    await screen.findByLabelText('Current password');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Different-password-123!' } });
    fireEvent.submit(container.querySelectorAll('form')[1]);
    await screen.findByText('New passwords do not match.');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/password')).toBe(false);
  });
  it('signs out after a successful password change', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/auth/me') ? account : { message: 'Password changed' })));
    const { container } = settings();
    fireEvent.change(await screen.findByLabelText('Current password'), { target: { value: 'Test-password-123!' } });
    for (const label of ['New password', 'Confirm new password']) fireEvent.change(screen.getByLabelText(label), { target: { value: 'Replacement-password-123!' } });
    fireEvent.submit(container.querySelectorAll('form')[1]);
    await screen.findByText('Sign in again');
    expect(localStorage.getItem('habeshaline_token')).toBeNull();
  });
});

