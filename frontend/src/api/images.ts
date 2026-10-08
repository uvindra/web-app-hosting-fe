import type { Deployment } from '../types/deployment';
import type { ImageSource } from '../types/imageSource';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { trackPath } from './trackPath';

export async function fetchImageSource(track: TrackRef): Promise<ImageSource> {
  return webAppHostingClient.get<ImageSource>(`${trackPath(track)}/image`);
}

/** Deploys another tag of the web app's image to the first environment (promote it from there). */
export async function deployImageTag(track: TrackRef, tag: string): Promise<Deployment> {
  return webAppHostingClient.post<Deployment>(`${trackPath(track)}/image/deploy`, { tag });
}
