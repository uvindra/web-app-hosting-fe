import type { Org } from '../types/org';
import { configuredOrgHandle, getOrgFromToken } from '../auth/tokenManager';

/**
 * The signed-in user's organization: the configured `ORG_HANDLE` when set (local OpenChoreo, whose BFF
 * always uses that namespace), otherwise the access token's claims (`ouHandle` / `organization.handle`).
 * There is no org list to fetch.
 */
export async function fetchOrgs(): Promise<Org[]> {
  const configured = configuredOrgHandle();
  if (configured) return [{ handle: configured, numericId: 0, displayName: configured, planLabel: '' }];
  const org = getOrgFromToken();
  if (!org.handle) return [];
  return [{ handle: org.handle, numericId: 0, displayName: org.name ?? org.handle, planLabel: '' }];
}
