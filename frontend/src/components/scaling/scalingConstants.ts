import { ScalingMethod } from '../../types/scaling';

export interface ScalingMethodOption {
  value: ScalingMethod;
  title: string;
  description: string;
  badge?: string;
  /** Not available yet (P1): shown but not selectable. */
  comingSoon?: boolean;
}

export const SCALING_METHODS: ScalingMethodOption[] = [
  {
    value: ScalingMethod.HPA,
    title: 'HPA',
    description: 'Scales the number of replicas based on CPU and memory usage.',
    badge: 'Coming soon',
    comingSoon: true,
  },
  {
    value: ScalingMethod.None,
    title: 'No Autoscaling',
    description: 'Runs a fixed number of replicas at all times.',
  },
];

/** Cap on replicas per environment. */
export const MAX_REPLICAS = 5;

export const CPU_THRESHOLD = { min: 10, max: 100, default: 50 };
export const MEMORY_THRESHOLD = { min: 20, max: 200, default: 50 };
