/** The org's Web App Hosting plan as the BFF reports it (`GET /plan`). Free plans gate the P1 features below. */
export interface PlanLimits {
  /** HPA autoscaling. */
  autoscaling: boolean;
  /** Cap on fixed replicas. */
  maxReplicas: number;
  /** Container resources above the defaults (CPU 100m, memory 350Mi request / 1Gi limit). */
  customResources: boolean;
  /** How many pipeline environments (in promotion order) can be deployed to; 0 = all. */
  maxEnvironments: number;
}

export interface Plan {
  type: 'free' | 'paid';
  name: string;
  status?: string;
  trialDaysRemaining?: number;
  limits: PlanLimits;
}
