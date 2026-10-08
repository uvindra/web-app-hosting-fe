import { MAX_REPLICAS } from './scalingConstants';
import { ScalingMethod, type ScalingConfig } from '../../types/scaling';
import type { PlanLimits } from '../../types/plan';

/** The replica caps a plan allows for this environment, relative to what is saved (see scalingPlanError). */
export interface ScalingCaps {
  /** HPA can be selected / edited. */
  hpaAllowed: boolean;
  /** Max fixed replicas. */
  fixedReplicas: number;
  /** Max HPA min / max replicas. */
  hpaMinReplicas: number;
  hpaMaxReplicas: number;
}

/**
 * Without the paid feature, what is already saved may be kept or reduced (e.g. after a plan downgrade) but not raised:
 * HPA stays editable while already on, with min/max replicas at most the saved ones, and fixed replicas may go up to
 * the saved count. The BFF applies the same rule. `limits` undefined = unknown: nothing is capped.
 */
export function scalingCaps(saved: ScalingConfig, limits?: PlanLimits): ScalingCaps {
  const autoscaling = limits?.autoscaling !== false;
  const keepsHpa = saved.method === ScalingMethod.HPA;
  return {
    hpaAllowed: autoscaling || keepsHpa,
    fixedReplicas: Math.min(MAX_REPLICAS, Math.max(limits?.maxReplicas ?? MAX_REPLICAS, saved.fixedReplicas)),
    hpaMinReplicas: autoscaling ? MAX_REPLICAS : saved.hpa.minReplicas,
    hpaMaxReplicas: autoscaling ? MAX_REPLICAS : saved.hpa.maxReplicas,
  };
}

/** Why the plan rejects `draft` (relative to `saved`), or undefined when it is allowed. */
export function scalingPlanError(draft: ScalingConfig, saved: ScalingConfig, limits?: PlanLimits): string | undefined {
  const caps = scalingCaps(saved, limits);
  if (draft.method === ScalingMethod.HPA) {
    if (!caps.hpaAllowed) return 'Autoscaling is not included in your plan.';
    if (draft.hpa.minReplicas > caps.hpaMinReplicas || draft.hpa.maxReplicas > caps.hpaMaxReplicas) {
      return `Your plan doesn't allow raising the autoscaling replicas above the current ${saved.hpa.minReplicas}–${saved.hpa.maxReplicas}.`;
    }
    return undefined;
  }
  if (draft.fixedReplicas > caps.fixedReplicas) return `Your plan allows up to ${caps.fixedReplicas} ${caps.fixedReplicas === 1 ? 'replica' : 'replicas'}.`;
  return undefined;
}
