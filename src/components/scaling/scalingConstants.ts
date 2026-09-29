import { ScalingMethod } from '../../types/scaling';

export interface ScalingMethodOption {
  value: ScalingMethod;
  title: string;
  description: string;
  badge?: string;
}

/** Scale-to-zero comes first: it is the default and the best fit for most web apps. */
export const SCALING_METHODS: ScalingMethodOption[] = [
  {
    value: ScalingMethod.ScaleToZero,
    title: 'Scale to Zero',
    description: 'Scales down to zero replicas during inactivity and back up when a new request arrives.',
    badge: 'Recommended',
  },
  {
    value: ScalingMethod.HPA,
    title: 'HPA',
    description: 'Scales the number of replicas based on CPU and memory usage.',
  },
  {
    value: ScalingMethod.None,
    title: 'No Autoscaling',
    description: 'Runs a fixed number of replicas at all times.',
  },
];

/** Cap on replicas per environment. */
export const MAX_REPLICAS = 5;
export const MAX_TARGET_PENDING_REQUESTS = 10_000;

export const CPU_THRESHOLD = { min: 10, max: 100, default: 50 };
export const MEMORY_THRESHOLD = { min: 20, max: 200, default: 50 };
