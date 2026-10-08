import { describe, expect, it } from 'vitest';
import { scalingCaps, scalingPlanError } from './scalingForm';
import { ScalingMethod, type ScalingConfig } from '../../types/scaling';
import type { PlanLimits } from '../../types/plan';

const free: PlanLimits = { autoscaling: false, maxReplicas: 1, customResources: false, maxEnvironments: 1 };
const paid: PlanLimits = { autoscaling: true, maxReplicas: 5, customResources: true, maxEnvironments: 0 };
const fixed = (n: number): ScalingConfig => ({ method: ScalingMethod.None, fixedReplicas: n, hpa: { minReplicas: 1, maxReplicas: 3, cpuUtilization: 70 } });
const hpa = (min: number, max: number): ScalingConfig => ({ method: ScalingMethod.HPA, fixedReplicas: 1, hpa: { minReplicas: min, maxReplicas: max, cpuUtilization: 70 } });

describe('scaling plan gating', () => {
  it('allows everything on a paid plan or while the plan is unknown', () => {
    expect(scalingPlanError(hpa(1, 5), fixed(1), paid)).toBeUndefined();
    expect(scalingPlanError(fixed(5), fixed(1), paid)).toBeUndefined();
    expect(scalingPlanError(fixed(5), fixed(1), undefined)).toBeUndefined();
  });
  it('rejects HPA and more than one replica on a free plan', () => {
    expect(scalingPlanError(hpa(1, 3), fixed(1), free)).toBeDefined();
    expect(scalingPlanError(fixed(2), fixed(1), free)).toBeDefined();
    expect(scalingPlanError(fixed(1), fixed(1), free)).toBeUndefined();
  });
  it('lets a downgraded org keep or reduce saved paid settings, not raise them', () => {
    expect(scalingPlanError(fixed(3), fixed(3), free)).toBeUndefined();
    expect(scalingPlanError(fixed(2), fixed(3), free)).toBeUndefined();
    expect(scalingPlanError(fixed(4), fixed(3), free)).toBeDefined();
    expect(scalingPlanError({ ...hpa(2, 4), hpa: { minReplicas: 2, maxReplicas: 4, cpuUtilization: 80 } }, hpa(2, 4), free)).toBeUndefined();
    expect(scalingPlanError(hpa(1, 3), hpa(2, 4), free)).toBeUndefined();
    expect(scalingPlanError(hpa(2, 5), hpa(2, 4), free)).toBeDefined();
    expect(scalingPlanError(hpa(3, 4), hpa(2, 4), free)).toBeDefined();
    expect(scalingPlanError(fixed(1), hpa(2, 4), free)).toBeUndefined();
  });
  it('caps the inputs at the saved values on a free plan', () => {
    expect(scalingCaps(fixed(3), free)).toEqual({ hpaAllowed: false, fixedReplicas: 3, hpaMinReplicas: 1, hpaMaxReplicas: 3 });
    expect(scalingCaps(hpa(2, 4), free)).toMatchObject({ hpaAllowed: true, fixedReplicas: 1, hpaMinReplicas: 2, hpaMaxReplicas: 4 });
    expect(scalingCaps(fixed(1), paid)).toEqual({ hpaAllowed: true, fixedReplicas: 5, hpaMinReplicas: 5, hpaMaxReplicas: 5 });
  });
});
