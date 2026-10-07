import type { Org } from '../types/org';
import { getOrgFromToken } from '../auth/tokenManager';

/**
 * The signed-in user's organization comes straight from the access token's claims
 * (`ouHandle` / `organization.handle`), falling back to the configured `ORG_HANDLE`
 * (local OpenChoreo tokens carry no org claims). There is no org list to fetch.
 */
export async function fetchOrgs(): Promise<Org[]> {
  const org = getOrgFromToken();
  const handle = org.handle ?? window.API_CONFIG.orgHandle;
  if (!handle) return [];
  return [{ handle, numericId: 0, displayName: org.name ?? handle, planLabel: '' }];
}
