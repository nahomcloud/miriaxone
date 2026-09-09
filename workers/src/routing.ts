type SecretBinding = {
  get(): Promise<string>;
};

type RawBackendSettings = {
  DB_NAME: string | SecretBinding;
  FRONTEND_URL: string;
  JWT_SECRET?: string | SecretBinding;
  MONGODB_URI?: string | SecretBinding;
  DB_HOST?: string;
  DB_USERNAME?: string | SecretBinding;
  DB_PASSWORD?: string | SecretBinding;
};

type BackendSettings = {
  DB_NAME: string;
  FRONTEND_URL: string;
  JWT_SECRET?: string;
  MONGODB_URI?: string;
  DB_HOST?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
};

async function resolveValue(value: string | SecretBinding | undefined): Promise<string | undefined> {
  return typeof value === 'object' ? value.get() : value;
}

export async function resolveBackendSettings(env: RawBackendSettings): Promise<BackendSettings> {
  return {
    DB_NAME: await resolveValue(env.DB_NAME) || 'miriaxcargo',
    FRONTEND_URL: env.FRONTEND_URL,
    JWT_SECRET: await resolveValue(env.JWT_SECRET),
    MONGODB_URI: await resolveValue(env.MONGODB_URI),
    DB_HOST: env.DB_HOST,
    DB_USERNAME: await resolveValue(env.DB_USERNAME),
    DB_PASSWORD: await resolveValue(env.DB_PASSWORD),
  };
}

export function containerEnvironment(env: BackendSettings): Record<string, string> {
  const vars: Record<string, string> = {
    DB_NAME: env.DB_NAME,
    FRONTEND_URL: env.FRONTEND_URL,
    FORWARDED_ALLOW_IPS: '*',
  };
  for (const key of ['JWT_SECRET', 'MONGODB_URI', 'DB_HOST', 'DB_USERNAME', 'DB_PASSWORD'] as const) {
    if (env[key]) vars[key] = env[key];
  }
  return vars;
}

export async function handleRequest(
  request: Request,
  env: BackendSettings & { ASSETS: { fetch(request: Request): Promise<Response> } },
  backend: (request: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const api = url.pathname === '/api' || url.pathname.startsWith('/api/') ||
    url.pathname === '/health' || url.pathname.startsWith('/media/');
  if (!api) return env.ASSETS.fetch(request);

  const origin = request.headers.get('Origin');
  const allowed = origin === url.origin || env.FRONTEND_URL.split(',').map(s => s.trim()).includes(origin || '');
  const cors = new Headers({ Vary: 'Origin', 'Cache-Control': 'no-store' });
  if (origin && allowed) {
    cors.set('Access-Control-Allow-Origin', origin);
    cors.set('Access-Control-Allow-Credentials', 'true');
    cors.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    cors.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  const jsonError = (error: string, status: number) => Response.json({ error }, { status, headers: cors });
  if (origin && !allowed) return jsonError('Origin is not allowed', 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.JWT_SECRET || new TextEncoder().encode(env.JWT_SECRET).length < 32 || env.JWT_SECRET === 'change-this-secret') {
    return jsonError('Backend JWT_SECRET is missing or invalid', 503);
  }
  if (!env.MONGODB_URI && !env.DB_HOST) return jsonError('Backend database connection is not configured', 503);

  // Preserve bodies, query strings and authorization; discard spoofable proxy headers.
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const headers = new Headers(request.headers);
  headers.delete('Host');
  headers.delete('Forwarded');
  headers.delete('X-Forwarded-For');
  headers.delete('X-Forwarded-Host');
  headers.set('X-Forwarded-Proto', 'https');
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Forwarded-For', clientIp);
  try {
    const upstream = await backend(new Request(url, new Request(request, { headers })));
    const responseHeaders = new Headers(upstream.headers);
    for (const key of [...responseHeaders.keys()]) {
      if (key.toLowerCase().startsWith('access-control-')) responseHeaders.delete(key);
    }
    const vary = responseHeaders.get('Vary');
    for (const [key, value] of cors) responseHeaders.set(key, value);
    if (vary) responseHeaders.set('Vary', `${vary}, Origin`);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    console.error(JSON.stringify({ event: 'backend_unavailable' }));
    cors.set('Retry-After', '10');
    return jsonError('Backend is unavailable. Please try again shortly.', 503);
  }
}
