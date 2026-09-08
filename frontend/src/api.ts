const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export function mediaUrl(path: string) { return path.startsWith('/media/') ? `${API_URL}${path}` : path; }

type Options = RequestInit & { auth?: boolean; responseType?: 'blob' };
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('habeshaline_token');
  if (options.auth && token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error('The API returned a web page instead of data. Check the frontend API proxy and backend connection.');
  }
  if (response.ok && options.responseType === 'blob') return await response.blob() as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && options.auth && token === localStorage.getItem('habeshaline_token')) {
      localStorage.removeItem('habeshaline_token');
      window.dispatchEvent(new Event('auth-expired'));
    }
    const nested = body.errors?.message || (body.errors && Object.values(body.errors)[0]);
    const detail = Array.isArray(body.detail) ? body.detail.map((item: { msg: string }) => item.msg).join('. ') : body.detail;
    throw new Error(body.message || body.error || detail || nested || 'Something went wrong. Please try again.');
  }
  return body as T;
}

export function unwrap<T>(value: T | { data: T }): T {
  return value && typeof value === 'object' && 'data' in value ? (value as {data:T}).data : value as T;
}
