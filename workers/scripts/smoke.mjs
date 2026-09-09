const origin = process.argv[2];
if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Usage: npm run worker:smoke -- https://your-worker.workers.dev');
const base = origin.replace(/\/$/, '');
let failures = 0;
for (const [path, expected] of [['/api/health', 200], ['/api/site/countries', 200], ['/api/site/platform-config', 200], ['/api/auth/me', 401], ['/api/admin/order', 401]]) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(90000) });
    const json = response.headers.get('content-type')?.includes('application/json');
    const body = json ? await response.json() : null;
    const passed = response.status === expected && json && (path !== '/api/health' || body?.status === 'ok');
    console.log(`${passed ? 'PASS' : 'FAIL'} ${path}: HTTP ${response.status}, ${json ? 'JSON' : 'not JSON'}`);
    if (!passed) failures++;
  } catch (error) { console.log(`FAIL ${path}: ${error.message}`); failures++; }
}
process.exitCode = failures ? 1 : 0;
