import type { Build, EnvironmentDeployment } from '../types/webApp';
import type { BuildConfig, BuildRun, LatestCommit } from '../types/build';
import { buildInProgressSteps, DEFAULT_BUILD_CONFIG, MOCK_BUILD_CONFIGS, MOCK_BUILD_RUNS, MOCK_BUILDS } from '../mock-data/builds';
import { MOCK_WEB_APPS } from '../mock-data/webApps';
import { environmentsFromStore } from './deployments';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchBuilds(webAppId: string): Promise<Build[]> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_BUILDS[webAppId] ?? [];
}

export async function fetchEnvironments(webAppId: string): Promise<EnvironmentDeployment[]> {
  await delay(NETWORK_DELAY_MS);
  // Derived from the deployments store so Deploy/Promote stay consistent with this view.
  return environmentsFromStore(webAppId);
}

// ---- Build page additions ----

const BUILD_COMPLETION_MS = 8000;

export async function fetchBuildRuns(webAppId: string): Promise<BuildRun[]> {
  await delay(NETWORK_DELAY_MS);
  return [...(MOCK_BUILD_RUNS[webAppId] ?? [])];
}

export async function fetchBuildConfig(webAppId: string, repoUrl?: string): Promise<BuildConfig> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_BUILD_CONFIGS[webAppId] ?? { ...DEFAULT_BUILD_CONFIG, repoUrl: repoUrl ?? DEFAULT_BUILD_CONFIG.repoUrl };
}

export async function fetchLatestCommit(webAppId: string, repoUrl: string | undefined, branch: string): Promise<LatestCommit> {
  await delay(NETWORK_DELAY_MS);
  // The web app's own latest source commit is the single source of truth (the Overview page shows the same one).
  const source = Object.values(MOCK_WEB_APPS).flat().find((a) => a.id === webAppId)?.latestCommit;
  if (source) return { ...source, branch, repoUrl: repoUrl ?? '' };
  // Apps without one: the commit that produced the newest build, dated just before it.
  const last = (MOCK_BUILD_RUNS[webAppId] ?? [])[0];
  const builtAt = last ? new Date(last.triggeredAt).getTime() : Date.now();
  return {
    sha: last?.commitSha ?? '7fb07eb',
    message: last?.commitMessage ?? 'Initial commit',
    author: last?.author ?? 'Amila De Silva',
    committedAt: new Date(builtAt - 10 * 60 * 1000).toISOString(),
    branch,
    repoUrl: repoUrl ?? '',
  };
}

/** Appends an in-progress build to both in-memory lists, then flips it to success after a short delay. */
export async function triggerBuild(webAppId: string, commit: LatestCommit): Promise<BuildRun> {
  await delay(NETWORK_DELAY_MS);
  const id = `build-${webAppId}-${Date.now()}`;
  const triggeredAt = new Date().toISOString();
  const run: BuildRun = {
    id,
    status: 'in-progress',
    commitSha: commit.sha,
    commitMessage: commit.message,
    author: commit.author,
    branch: commit.branch,
    triggeredAt,
    steps: buildInProgressSteps(),
  };
  MOCK_BUILD_RUNS[webAppId] = [run, ...(MOCK_BUILD_RUNS[webAppId] ?? [])];
  MOCK_BUILDS[webAppId] = [{ id, status: 'in-progress', commitSha: commit.sha, commitMessage: commit.message, triggeredAt }, ...(MOCK_BUILDS[webAppId] ?? [])];

  setTimeout(() => {
    const completedAt = new Date().toISOString();
    MOCK_BUILD_RUNS[webAppId] = (MOCK_BUILD_RUNS[webAppId] ?? []).map((r) =>
      r.id === id
        ? {
            ...r,
            status: 'success',
            completedAt,
            steps: r.steps.map((s) => ({ ...s, status: 'success', logs: s.logs.length > 0 ? s.logs : [`${s.name} completed`] })),
          }
        : r,
    );
    MOCK_BUILDS[webAppId] = (MOCK_BUILDS[webAppId] ?? []).map((b) => (b.id === id ? { ...b, status: 'success' } : b));
  }, BUILD_COMPLETION_MS);

  return run;
}
