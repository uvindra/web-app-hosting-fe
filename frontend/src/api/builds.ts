import type { Build, EnvironmentDeployment } from '../types/webApp';
import type { BuildConfig, BuildRun, LatestCommit } from '../types/build';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { trackPath } from './trackPath';

/** Build summaries (newest first) for the Overview page. */
export async function fetchBuilds(track: TrackRef): Promise<Build[]> {
  const runs = await fetchBuildRuns(track);
  return runs.map((r) => ({ id: r.id, status: r.status, commitSha: r.commitSha, commitMessage: r.commitMessage, triggeredAt: r.triggeredAt }));
}

export async function fetchEnvironments(track: TrackRef): Promise<EnvironmentDeployment[]> {
  return webAppHostingClient.get<EnvironmentDeployment[]>(`${trackPath(track)}/environments`);
}

/** Builds with their steps; step logs are fetched separately (fetchBuildLogs). */
export async function fetchBuildRuns(track: TrackRef): Promise<BuildRun[]> {
  return webAppHostingClient.get<BuildRun[]>(`${trackPath(track)}/builds`);
}

/** One build with per-step logs (live while running, archived afterwards). */
export async function fetchBuildLogs(track: TrackRef, buildId: string): Promise<BuildRun> {
  return webAppHostingClient.get<BuildRun>(`${trackPath(track)}/builds/${encodeURIComponent(buildId)}/logs`);
}

export async function fetchBuildConfig(track: TrackRef): Promise<BuildConfig> {
  return webAppHostingClient.get<BuildConfig>(`${trackPath(track)}/build-config`);
}

export async function fetchLatestCommit(track: TrackRef): Promise<LatestCommit> {
  return webAppHostingClient.get<LatestCommit>(`${trackPath(track)}/latest-commit`);
}

export async function triggerBuild(track: TrackRef, commit: LatestCommit): Promise<BuildRun> {
  return webAppHostingClient.post<BuildRun>(`${trackPath(track)}/builds`, { sha: commit.sha });
}
