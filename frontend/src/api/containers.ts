import type { ContainerUpdate, WebAppContainer } from '../types/containers';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';

export async function fetchContainers(track: TrackRef, env: EnvironmentId): Promise<WebAppContainer[]> {
  return webAppHostingClient.get<WebAppContainer[]>(`${envPath(track, env)}/containers`);
}

export async function updateContainer(track: TrackRef, env: EnvironmentId, containerId: string, update: ContainerUpdate): Promise<WebAppContainer> {
  return webAppHostingClient.put<WebAppContainer>(`${envPath(track, env)}/containers/${encodeURIComponent(containerId)}`, update);
}
