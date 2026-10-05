const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, 'The server is not responding correctly');
    return res;
  }

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong');
  return data;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const qs = (params) => {
  const clean = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
};

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),
};

export const mediaUrl = (id) => (id ? `${BASE}/media/${id}` : null);
