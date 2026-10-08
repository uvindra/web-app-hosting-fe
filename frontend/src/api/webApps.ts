import type { CreateWebAppInput, WebApp } from '../types/webApp';
import { HttpError } from '../types/http';
import { webAppHostingClient } from './httpClient';

const enc = encodeURIComponent;

export async function fetchWebApps(projectId: string): Promise<WebApp[]> {
  return webAppHostingClient.get<WebApp[]>(`/projects/${enc(projectId)}/webapps`);
}

export async function fetchWebApp(projectId: string, webAppId: string): Promise<WebApp | null> {
  try {
    return await webAppHostingClient.get<WebApp>(`/projects/${enc(projectId)}/webapps/${enc(webAppId)}`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Creates the web app (its default track): Git sources start their first build; a container image (sourceType
 * `docker`, public images only) is deployed to the first environment. Rejects with a 402 HttpError when over quota.
 */
export async function createWebApp(projectId: string, input: CreateWebAppInput): Promise<WebApp> {
  return webAppHostingClient.post<WebApp>(`/projects/${enc(projectId)}/webapps`, input);
}
