/** Billing user API `GET /organization?product=` (WSO2 Cloud billing service). */
export interface BillingOrg {
  id: string;
  name: string;
  subscription?: {
    id: string;
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | string;
    trial?: { days_remaining: number; trial_end: string };
    product?: { id: string; name: string; code: string };
    plan?: { name?: string; code?: string };
  };
}

/** Billing product code of Web App Hosting (D2, D10). */
export const BILLING_PRODUCT = 'web-app-hosting';
