export interface Env {
  LEGACY_API_URL: string;
  FRONTEND_URL?: string;
}

function allowedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get('Origin');
  if (!origin) return env.FRONTEND_URL || '*';
  const allowed = (env.FRONTEND_URL || '').split(',').map(value => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    Vary: 'Origin',
  });
  return headers;
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request, env)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxy(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const upstream = new URL(path + incoming.search, env.LEGACY_API_URL.replace(/\/$/, '') + '/');
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  const response = await fetch(new Request(upstream, { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body, redirect: 'follow' }));
  return withCors(response, request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return withCors(Response.json({ status: 'ok', service: 'miriax-worker', migration: 'proxy-to-fastapi' }), request, env);
    }
    if (!env.LEGACY_API_URL) return withCors(Response.json({ error: 'LEGACY_API_URL is not configured' }, { status: 503 }), request, env);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxy(request, env);
    return withCors(new Response('Not found', { status: 404 }), request, env);
  },
};
