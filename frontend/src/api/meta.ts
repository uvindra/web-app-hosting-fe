import type { PlatformMeta } from '../types/meta';
import { webAppHostingClient } from './httpClient';

export async function fetchMeta(): Promise<PlatformMeta> {
  return webAppHostingClient.get<PlatformMeta>('/meta');
}
