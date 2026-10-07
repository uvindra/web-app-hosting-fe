import type { ConfigItem, ConfigWrite } from '../types/configs';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';

export async function fetchConfigs(track: TrackRef, env: EnvironmentId): Promise<ConfigItem[]> {
  return webAppHostingClient.get<ConfigItem[]>(`${envPath(track, env)}/configs`);
}

export async function createConfig(track: TrackRef, env: EnvironmentId, write: ConfigWrite): Promise<ConfigItem> {
  return webAppHostingClient.post<ConfigItem>(`${envPath(track, env)}/configs`, write);
}

export async function updateConfig(track: TrackRef, env: EnvironmentId, id: string, write: ConfigWrite): Promise<ConfigItem> {
  return webAppHostingClient.put<ConfigItem>(`${envPath(track, env)}/configs/${encodeURIComponent(id)}`, write);
}

export async function deleteConfig(track: TrackRef, env: EnvironmentId, id: string): Promise<void> {
  await webAppHostingClient.delete<void>(`${envPath(track, env)}/configs/${encodeURIComponent(id)}`);
}
