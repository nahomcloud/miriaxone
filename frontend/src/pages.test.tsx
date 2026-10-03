import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

function renderAt(path: string) {
  vi.stubGlobal('scrollTo', vi.fn());
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

it('closes the mobile menu when a navigation item is chosen', () => {
  renderAt('/ship');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const menu = document.getElementById('primary-navigation');
  expect(menu?.className).toContain('open');
  fireEvent.click(screen.getByRole('link', { name: 'Ship' }));
  expect(menu?.className).not.toContain('open');
});

it('nudges the cart when an item is added', () => {
  renderAt('/');
  localStorage.setItem('miriax_cart', JSON.stringify([{ qty: 1 }]));
  act(() => { window.dispatchEvent(new CustomEvent('miriax-cart', { detail: { name: 'Sunflower Bunch' } })); });
  expect(screen.getByRole('button', { name: 'Cart, 1 item' }).className).toContain('bump');
  expect(screen.getByRole('dialog', { name: 'Cart' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Sunflower Bunch added to cart');
  expect(document.querySelector('#primary-navigation .nav-cart')).toBeNull();
});

it('opens the cart from the bag and lists what was added', () => {
  localStorage.setItem('miriax_cart', JSON.stringify([{ productId: 'sunflwr', name: 'Sunflower Bunch (10)', qty: 1, price: 40 }]));
  renderAt('/');
  fireEvent.click(screen.getByRole('button', { name: 'Cart, 1 item' }));
  expect(screen.getByRole('dialog', { name: 'Cart' }).textContent).toContain('Sunflower Bunch (10)');
  expect(screen.getByRole('link', { name: 'Review gifts' }).getAttribute('href')).toBe('/ship?service=express-gifts');
});

it('explains a short tracking code and offers contact', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } })));
  renderAt('/track?id=abc');
  expect((await screen.findByRole('alert')).textContent).toContain('not a tracking number');
  expect(screen.getByRole('link', { name: 'Ask us about it' }).getAttribute('href')).toBe('/contact?ref=abc');
});

it('shows a tracked shipment and its checkpoint', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    status: 'In transit', trackingNumber: 'HBL-100', origin: 'Virginia', destination: 'Addis Ababa',
    tracking: [{ status: 'Received', description: 'At the warehouse', createdAt: '2026-01-02T00:00:00Z' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })));
  renderAt('/track?id=HBL-100');
  expect(await screen.findByRole('heading', { name: 'In transit' })).toBeTruthy();
  expect(screen.getByText('At the warehouse')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ask about this shipment' }).getAttribute('href')).toBe('/contact?ref=HBL-100');
});

it('sends a contact reason instead of a blank subject', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  renderAt('/contact?ref=HBL-100');
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Nahom' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nahom@example.com' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '7035550100' } });
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Where is it?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByRole('status');
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(String(init.body));
  expect(body.subject).toBe('Tracking HBL-100');
  expect(body.message).toBe('Where is it?');
});

it('filters the account list to shipments that are still moving', async () => {
  localStorage.setItem('habeshaline_token', 'token');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/auth/me')) return new Response(JSON.stringify({ _id: 'u1', email: 'user@example.com', name: 'Test User', role: 'user' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ data: [
      { _id: 'move-1', name: 'Barrel', status: 'pending', price: 40, createdAt: '2026-01-01' },
      { _id: 'done-1', name: 'Gift', status: 'delivered', price: 20, createdAt: '2026-01-02' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  renderAt('/account');
  expect(await screen.findByText('Shipment dashboard')).toBeTruthy();
  expect(await screen.findByText('move-1')).toBeTruthy();
  expect(screen.getByText('done-1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Still moving' }));
  expect(screen.queryByText('done-1')).toBeNull();
  expect(screen.getByText('move-1')).toBeTruthy();
});
