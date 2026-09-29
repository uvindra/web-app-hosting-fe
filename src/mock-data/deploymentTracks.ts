import type { DeploymentTrack } from '../types/deploymentTracks';

const DAYS = 24 * 60 * 60 * 1000;
const now = Date.now();

/** Default track for web apps without an explicit entry. */
export function defaultTracks(): DeploymentTrack[] {
  return [{ id: 'track-main', name: 'main', branch: 'main', isDefault: true, autoDeploy: true, deployed: true, createdAt: new Date(now - 60 * DAYS).toISOString() }];
}

export const MOCK_DEPLOYMENT_TRACKS: Record<string, DeploymentTrack[]> = {
  'webapp-my-portfolio': [
    ...defaultTracks(),
    { id: 'track-staging', name: 'staging', branch: 'release/staging', isDefault: false, autoDeploy: false, deployed: true, createdAt: new Date(now - 20 * DAYS).toISOString() },
    { id: 'track-redesign', name: 'redesign', branch: 'feature/redesign', isDefault: false, autoDeploy: false, deployed: false, createdAt: new Date(now - 5 * DAYS).toISOString() },
  ],
};
