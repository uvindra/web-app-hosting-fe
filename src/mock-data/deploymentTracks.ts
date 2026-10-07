import type { DeploymentTrack } from '../types/deploymentTracks';

const DAYS = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Default track for web apps without an explicit entry. */
export function defaultTracks(): DeploymentTrack[] {
  return [{ id: 'track-main', branch: 'main', isDefault: true, autoDeploy: true, deployed: true, createdAt: new Date(now - 60 * DAYS).toISOString() }];
}

export const MOCK_DEPLOYMENT_TRACKS: Record<string, DeploymentTrack[]> = {
  'webapp-my-portfolio': [
    ...defaultTracks(),
    { id: 'track-staging', branch: 'release/staging', isDefault: false, autoDeploy: false, deployed: true, createdAt: new Date(now - 20 * DAYS).toISOString() },
    { id: 'track-redesign', branch: 'feature/redesign', isDefault: false, autoDeploy: false, deployed: false, createdAt: new Date(now - 5 * DAYS).toISOString() },
  ],
};

/** Branches in each web app's Git repository, for the create-track branch picker. */
export const DEFAULT_REPO_BRANCHES = ['main', 'develop', 'release/staging'];

export const MOCK_REPO_BRANCHES: Record<string, string[]> = {
  'webapp-my-portfolio': ['main', 'develop', 'release/staging', 'feature/redesign', 'feature/dark-mode'],
};
