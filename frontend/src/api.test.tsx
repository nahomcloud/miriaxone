import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

it('rejects an HTML fallback instead of treating it as successful API data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })));
  await expect(api('/health')).rejects.toThrow('Check the frontend API proxy and backend connection');
});
