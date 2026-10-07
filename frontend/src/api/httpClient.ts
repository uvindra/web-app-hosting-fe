import { authenticatedFetch } from '../auth/tokenManager';
import { HttpError } from '../types/http';

export interface HttpClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
}

/** Builds an HttpError from a response body: the BFF answers `{code, message}`. */
export function toHttpError(status: number, body: string): HttpError {
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string };
    if (parsed && typeof parsed.message === 'string') return new HttpError(status, parsed.message, parsed.code);
  } catch {
    /* not JSON */
  }
  return new HttpError(status, `HTTP ${status}: ${body}`);
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
      throw toHttpError(res.status, body || res.statusText);
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

// Single client for all Web App Hosting BFF calls — see VITE_WEBAPP_API_URL in runtimeConfig.
export const webAppHostingClient = createHttpClient(() => window.API_CONFIG.webAppApiUrl);
