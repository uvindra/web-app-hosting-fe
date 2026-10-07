import { useQuery } from '@tanstack/react-query';
import { fetchBillingOrg } from '../api/billing';
import type { BillingOrg } from '../types/billing';

/** True when a billing service is configured (WSO2 Cloud); the local OpenChoreo target has none and hides billing UI. */
export function billingEnabled(): boolean {
  return !!window.API_CONFIG?.billingApiBaseUrl;
}

/** Activates (first login) and reads the org's Web App Hosting subscription. */
export function useBillingOrg(orgHandle: string) {
  return useQuery({
    queryKey: ['billingOrg', orgHandle],
    queryFn: fetchBillingOrg,
    enabled: billingEnabled() && !!orgHandle,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Short plan label for the header badge, e.g. "Free" or "Trial · 12 days left". */
export function planLabel(org: BillingOrg | undefined): string | undefined {
  const sub = org?.subscription;
  if (!sub) return undefined;
  if (sub.status === 'trial') return sub.trial ? `Trial · ${sub.trial.days_remaining} days left` : 'Trial';
  const name = sub.plan?.name ?? (sub.status === 'active' ? 'Active' : sub.status);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
