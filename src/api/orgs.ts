import type { Org } from '../types/org';
import { MOCK_ORGS } from '../mock-data/orgs';

// STUB — the Web App Hosting backend doesn't exist yet. Swap the body for a
// `webAppHostingClient.get<Org[]>('/orgs')` call once it does; the signature won't change.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchOrgs(): Promise<Org[]> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_ORGS;
}
