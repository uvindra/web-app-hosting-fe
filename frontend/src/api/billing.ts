import { authenticatedFetch } from '../auth/tokenManager';
import { toHttpError } from './httpClient';
import { BILLING_PRODUCT, type BillingOrg } from '../types/billing';

/**
 * Fetches the org's billing record for Web App Hosting. On first login this also activates the
 * product's default (free) plan — without a subscription, the platform API's entitlement check
 * rejects creates. Precedent: App Factory BillingActivation, ICP `api/cloud/billing.ts`.
 */
export async function fetchBillingOrg(): Promise<BillingOrg> {
  const base = window.API_CONFIG.billingApiBaseUrl;
  if (!base) throw new Error('Billing is not configured');
  const res = await authenticatedFetch(`${base}/organization?${new URLSearchParams({ product: BILLING_PRODUCT })}`, { headers: { Accept: 'application/json' } });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw toHttpError(res.status, text || res.statusText);
  return JSON.parse(text) as BillingOrg;
}
