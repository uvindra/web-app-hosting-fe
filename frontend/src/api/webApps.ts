import type { CreateWebAppInput, WebApp } from '../types/webApp';
import { MOCK_WEB_APPS } from '../mock-data/webApps';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const webAppsByProject: Record<string, WebApp[]> = Object.fromEntries(Object.entries(MOCK_WEB_APPS).map(([projectId, apps]) => [projectId, [...apps]]));

export async function fetchWebApps(projectId: string): Promise<WebApp[]> {
  await delay(NETWORK_DELAY_MS);
  return webAppsByProject[projectId] ?? [];
}

export async function fetchWebApp(projectId: string, webAppId: string): Promise<WebApp | null> {
  await delay(NETWORK_DELAY_MS);
  return (webAppsByProject[projectId] ?? []).find((a) => a.id === webAppId) ?? null;
}

function toDomain(input: CreateWebAppInput): Pick<WebApp, 'framework' | 'repoUrl'> {
  switch (input.sourceType) {
    case 'github':
    case 'public-git': {
      // `repository` is normally just an org/repo-relative name, but the form falls back to
      // storing the whole pasted URL here when it can't be parsed into org+repo — don't re-prefix
      // it with the GitHub base in that case, or the resulting link doubles up.
      const repository = input.repository.trim();
      if (/^https?:\/\//i.test(repository)) {
        return { framework: input.buildPreset, repoUrl: repository };
      }
      const org = input.gitOrganization ? `${input.gitOrganization}/` : '';
      return { framework: input.buildPreset, repoUrl: `https://github.com/${org}${repository}` };
    }
    case 'docker':
      return { framework: 'Docker', repoUrl: undefined };
    case 'sample':
      return { framework: 'Sample', repoUrl: undefined };
  }
}

export async function createWebApp(projectId: string, input: CreateWebAppInput): Promise<WebApp> {
  await delay(NETWORK_DELAY_MS);
  const { handler, displayName } = input;
  const webApp: WebApp = {
    id: `webapp-${handler}`,
    handler,
    displayName,
    status: 'not-deployed',
    updatedAt: new Date().toISOString(),
    sourceType: input.sourceType,
    ...toDomain(input),
  };
  webAppsByProject[projectId] = [webApp, ...(webAppsByProject[projectId] ?? [])];
  return webApp;
}
