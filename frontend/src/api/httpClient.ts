import { authenticatedFetch } from '../auth/tokenManager';
import { HttpError } from '../types/http';

export interface HttpClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
}

// Factory to create HTTP clients for different services.
export function createHttpClient(getBaseUrl: () => string): HttpClient {
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${getBaseUrl()}${path}`;
    const init: RequestInit = {
      ...options,
      headers: {
        ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    };

    const res = await authenticatedFetch(url, init);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HttpError(res.status, `HTTP ${res.status}: ${body || res.statusText}`);
    }
    const text = await res.text().catch(() => '');
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PUT', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PATCH', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
  };
}

// Single client for all Web App Hosting backend calls — see VITE_WEBAPP_API_URL in runtimeConfig.
// Not yet used by src/api/*.ts (those still read from mock-data while the backend is built), but
// wired up so swapping a stub function's body for a real call is a small, localized diff.
export const webAppHostingClient = createHttpClient(() => window.API_CONFIG.webAppApiUrl);
