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

/** Creates the web app (its default track) and starts its first build. Rejects with a 402 HttpError when over quota. */
export async function createWebApp(projectId: string, input: CreateWebAppInput): Promise<WebApp> {
  if (input.sourceType !== 'github' && input.sourceType !== 'public-git') {
    throw new Error('Only Git repositories are supported in this release.');
  }
  return webAppHostingClient.post<WebApp>(`/projects/${enc(projectId)}/webapps`, input);
}
