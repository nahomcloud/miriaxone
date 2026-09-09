import { describe, expect, it, vi } from 'vitest';
import { containerEnvironment, handleRequest } from '../src/routing';

const settings = () => ({ DB_NAME: 'test', FRONTEND_URL: 'https://frontend.example', JWT_SECRET: 'x'.repeat(32), MONGODB_URI: 'mongodb://test', ASSETS: { fetch: vi.fn(async () => new Response('frontend')) } });
const request = (path: string, init?: RequestInit) => new Request('https://worker.example' + path, init);

describe('Cloudflare container routing', () => {
  it('serves the frontend without starting a container', async () => {
    const env = settings(); const backend = vi.fn();
    expect(await (await handleRequest(request('/dashboard'), env, backend)).text()).toBe('frontend');
    expect(backend).not.toHaveBeenCalled();
  });
  it('forwards multipart bodies, query strings and authorization, replacing forged proxy headers', async () => {
    const form = new FormData(); form.set('name', 'Sender'); form.set('document_0', new Blob(['%PDF-test']), 'invoice.pdf');
    const backend = vi.fn(async (upstream: Request) => {
      expect(new URL(upstream.url).pathname).toBe('/site/checkout');
      expect(new URL(upstream.url).search).toBe('?mode=quote');
      expect(upstream.headers.get('Authorization')).toBe('Bearer test');
      expect(upstream.headers.get('X-Forwarded-For')).toBe('203.0.113.5');
      expect(upstream.headers.get('Forwarded')).toBeNull();
      const sent = await upstream.formData();
      expect(sent.get('name')).toBe('Sender');
      expect(await (sent.get('document_0') as Blob).text()).toBe('%PDF-test');
      return Response.json({ ok: true });
    });
    const response = await handleRequest(request('/api/site/checkout?mode=quote', { method: 'POST', body: form, headers: { Authorization: 'Bearer test', 'CF-Connecting-IP': '203.0.113.5', 'X-Forwarded-For': 'spoofed', Forwarded: 'for=spoofed' } }), settings(), backend);
    expect(response.status).toBe(200);
    expect(backend).toHaveBeenCalledOnce();
  });
  it.each(['/health', '/api/health'])('checks the actual backend at %s', async (path) => {
    const backend = vi.fn(async () => Response.json({ status: 'down' }, { status: 503 }));
    const response = await handleRequest(request(path), settings(), backend);
    expect(response.status).toBe(503); expect(backend).toHaveBeenCalledOnce();
  });
  it('returns JSON on cold-start failures without leaking secrets', async () => {
    const response = await handleRequest(request('/api/health'), settings(), async () => { throw new Error('mongodb://secret'); });
    expect(response.status).toBe(503); expect(response.headers.get('Retry-After')).toBe('10');
    expect(await response.text()).not.toContain('mongodb');
  });
  it('requires secrets before starting the backend', async () => {
    const env = settings(); env.JWT_SECRET = ''; const backend = vi.fn();
    expect((await handleRequest(request('/api/health'), env, backend)).status).toBe(503);
    expect(backend).not.toHaveBeenCalled();
  });
  it('handles preflight and rejects unapproved origins without starting a container', async () => {
    const backend = vi.fn();
    const allowed = await handleRequest(request('/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://frontend.example' } }), settings(), backend);
    expect(allowed.status).toBe(204); expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://frontend.example');
    expect((await handleRequest(request('/api/auth/login', { headers: { Origin: 'https://evil.example' } }), settings(), backend)).status).toBe(403);
    expect(backend).not.toHaveBeenCalled();
  });
  it('allows same-origin requests and replaces backend CORS headers', async () => {
    const response = await handleRequest(request('/api/auth/me', { headers: { Origin: 'https://worker.example' } }), settings(), async () => Response.json({}, { status: 401, headers: { 'Access-Control-Allow-Origin': 'https://old.example' } }));
    expect(response.status).toBe(401); expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://worker.example');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps media URLs on the backend and streams private downloads', async () => {
    const response = await handleRequest(request('/media/image.png'), settings(), async upstream => {
      expect(new URL(upstream.url).pathname).toBe('/media/image.png');
      return new Response(new Uint8Array([1, 2, 3]), {headers:{'Content-Type':'image/png'}});
    });
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it('passes only backend settings into the container', () => {
    const env = settings(); expect(containerEnvironment(env)).toEqual({ DB_NAME: 'test', FRONTEND_URL: 'https://frontend.example', JWT_SECRET: 'x'.repeat(32), MONGODB_URI: 'mongodb://test', FORWARDED_ALLOW_IPS: '*' });
  });
});
