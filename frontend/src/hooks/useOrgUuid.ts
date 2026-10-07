import { getOrgUuidFromToken } from '../auth/tokenManager';

/**
 * Returns the current org UUID derived from the active access token, or null
 * if no org-scoped token is present. Components should use this instead of
 * reaching into auth/tokenManager directly.
 */
export function useOrgUuid(): string | null {
  return getOrgUuidFromToken();
}
