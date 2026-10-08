import type { Plan } from '../types/plan';
import { webAppHostingClient } from './httpClient';

export async function fetchPlan(): Promise<Plan> {
  return webAppHostingClient.get<Plan>('/plan');
}
