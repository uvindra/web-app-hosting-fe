import { ScalingMethod } from '../../types/scaling';

export interface ScalingMethodOption {
  value: ScalingMethod;
  title: string;
  description: string;
  /** Needs a paid plan (PlanLimits.autoscaling). */
  paidOnly?: boolean;
}

export const SCALING_METHODS: ScalingMethodOption[] = [
  {
    value: ScalingMethod.HPA,
    title: 'HPA',
    description: 'Scales the number of replicas between a minimum and a maximum based on CPU and/or memory utilization.',
    paidOnly: true,
  },
  {
    value: ScalingMethod.None,
    title: 'No Autoscaling',
    description: 'Runs a fixed number of replicas at all times.',
  },
];

/** Cap on replicas per environment. */
export const MAX_REPLICAS = 5;

/** Utilization targets, as a percentage of the container's request (the BFF accepts 1–100). */
export const CPU_THRESHOLD = { min: 10, max: 100, default: 70 };
export const MEMORY_THRESHOLD = { min: 10, max: 100, default: 80 };
