import type { CreateDeploymentTrackInput, DeploymentTrack, TrackDeletableResult } from '../types/deploymentTracks';
import { defaultTracks, MOCK_DEPLOYMENT_TRACKS } from '../mock-data/deploymentTracks';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const store = new Map<string, DeploymentTrack[]>();

function tracksFor(webAppId: string): DeploymentTrack[] {
  let tracks = store.get(webAppId);
  if (!tracks) {
    tracks = (MOCK_DEPLOYMENT_TRACKS[webAppId] ?? defaultTracks()).map((t) => ({ ...t }));
    store.set(webAppId, tracks);
  }
  return tracks;
}

export async function fetchDeploymentTracks(webAppId: string): Promise<DeploymentTrack[]> {
  await delay(NETWORK_DELAY_MS);
  return tracksFor(webAppId).map((t) => ({ ...t }));
}

export async function createDeploymentTrack(webAppId: string, input: CreateDeploymentTrackInput): Promise<DeploymentTrack> {
  await delay(NETWORK_DELAY_MS);
  const tracks = tracksFor(webAppId);
  if (tracks.some((t) => t.name === input.name)) throw new Error(`A deployment track named "${input.name}" already exists.`);
  if (tracks.some((t) => t.branch === input.branch)) throw new Error(`A deployment track for branch "${input.branch}" already exists.`);
  const track: DeploymentTrack = { id: `track-${Date.now()}`, name: input.name, branch: input.branch, isDefault: false, autoDeploy: false, deployed: false, createdAt: new Date().toISOString() };
  tracks.push(track);
  return { ...track };
}

export async function checkDeploymentTrackDeletable(webAppId: string, trackId: string): Promise<TrackDeletableResult> {
  await delay(NETWORK_DELAY_MS);
  const track = tracksFor(webAppId).find((t) => t.id === trackId);
  if (!track) return { canDelete: false, message: 'Deployment track not found.' };
  if (track.isDefault) return { canDelete: false, message: 'The default deployment track cannot be deleted.' };
  if (track.deployed) return { canDelete: false, message: 'This track has active deployments. Undeploy it from all environments first.' };
  return { canDelete: true };
}

export async function deleteDeploymentTrack(webAppId: string, trackId: string): Promise<void> {
  await delay(NETWORK_DELAY_MS);
  const tracks = tracksFor(webAppId);
  const track = tracks.find((t) => t.id === trackId);
  if (!track) throw new Error('Deployment track not found.');
  if (track.isDefault) throw new Error('The default deployment track cannot be deleted.');
  store.set(
    webAppId,
    tracks.filter((t) => t.id !== trackId),
  );
}

export async function updateAutoDeploy(webAppId: string, trackId: string, autoDeploy: boolean): Promise<DeploymentTrack> {
  await delay(NETWORK_DELAY_MS);
  const track = tracksFor(webAppId).find((t) => t.id === trackId);
  if (!track) throw new Error('Deployment track not found.');
  track.autoDeploy = autoDeploy;
  return { ...track };
}
