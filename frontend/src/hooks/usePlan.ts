import { useQuery } from '@tanstack/react-query';
import { fetchPlan } from '../api/plan';
import type { PlanLimits } from '../types/plan';

/** The org's plan and its feature limits (gated controls are disabled with an upgrade hint). */
export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: fetchPlan, staleTime: 60 * 1000 });
}

/** The plan's limits, or undefined while loading / on error (callers then leave controls enabled; the BFF still enforces them). */
export function usePlanLimits(): PlanLimits | undefined {
  return usePlan().data?.limits;
}

/** Where the "Upgrade" links go; empty when no billing console is configured (local OpenChoreo). */
export function upgradeUrl(): string {
  return window.API_CONFIG?.billingConsoleUrl ?? '';
}
