export const serviceEndpoint = String((import.meta as any).env?.VITE_NOVA_SERVICE_URL || (import.meta as any).env?.VITE_NOVA_RELAY_URL || '').replace(/\/$/, '');

export function validateServiceEndpoint(value: string) {
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Invalid NOVA service endpoint');
  const local = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) throw new Error('NOVA online services require HTTPS');
  return parsed.origin;
}

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function serviceRequest<T>(path: string, init: RequestInit = {}, session?: string): Promise<T> {
  if (!serviceEndpoint) throw new ServiceError('NOVA online services are not configured in this build.', 503);
  const endpoint = validateServiceEndpoint(serviceEndpoint);
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session}`);
  let response: Response;
  try {
    response = await fetch(`${endpoint}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(10000) });
  } catch (error) {
    throw new ServiceError(`NOVA online services are unavailable: ${String(error)}`, 0);
  }
  if (!response.ok) {
    let message = `NOVA service request failed (${response.status})`;
    try { const value = await response.json(); if (value?.error) message = value.error; } catch { const text = await response.text().catch(() => ''); if (text) message = text; }
    throw new ServiceError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function trustedRelay(value: string, configured = serviceEndpoint) {
  const origin = validateServiceEndpoint(value);
  if (!configured || origin !== validateServiceEndpoint(configured)) {
    throw new Error('This invite belongs to a different service. NOVA will not send your account session there.');
  }
  return origin;
}
