import type { ContainerUpdate, ImagePullPolicy, WebAppContainer } from '../../types/containers';

export const CPU_MIN = 50;
export const CPU_MAX = 2000;
export const CPU_STEP = 50;
export const MEMORY_MIN = 64;
export const MEMORY_MAX = 4096;
export const MEMORY_STEP = 64;

export interface ContainerForm {
  imagePullPolicy: ImagePullPolicy;
  cpuRequest: number;
  cpuLimit: number;
  memoryRequest: number;
  memoryLimit: number;
  /** One entry per line. */
  command: string;
  args: string;
}

export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function containerToForm(c: WebAppContainer): ContainerForm {
  return {
    imagePullPolicy: c.imagePullPolicy,
    cpuRequest: c.cpuRequest,
    cpuLimit: c.cpuLimit,
    memoryRequest: c.memoryRequest,
    memoryLimit: c.memoryLimit,
    command: c.command.join('\n'),
    args: c.args.join('\n'),
  };
}

export function formToUpdate(f: ContainerForm): ContainerUpdate {
  return {
    imagePullPolicy: f.imagePullPolicy,
    cpuRequest: f.cpuRequest,
    cpuLimit: f.cpuLimit,
    memoryRequest: f.memoryRequest,
    memoryLimit: f.memoryLimit,
    command: splitLines(f.command),
    args: splitLines(f.args),
  };
}

export function isFormDirty(f: ContainerForm, c: WebAppContainer): boolean {
  return JSON.stringify(formToUpdate(f)) !== JSON.stringify(formToUpdate(containerToForm(c)));
}

/** The platform's default resources (CPU millicores, memory MiB); free plans can't go above them. */
export const DEFAULT_RESOURCES = { cpuRequest: 100, cpuLimit: 100, memoryRequest: 350, memoryLimit: 1024 } as const;

/**
 * Whether the form raises a resource above both the default and its saved value (a paid-plan feature). Keeping or
 * lowering values that are already above the defaults (e.g. after a plan downgrade) is allowed on every plan — the BFF
 * applies the same rule.
 */
export function exceedsAllowance(f: ContainerForm, saved: WebAppContainer): boolean {
  const d = DEFAULT_RESOURCES;
  const above = (value: number, def: number, current: number): boolean => value > Math.max(def, current);
  return above(f.cpuRequest, d.cpuRequest, saved.cpuRequest) || above(f.cpuLimit, d.cpuLimit, saved.cpuLimit) || above(f.memoryRequest, d.memoryRequest, saved.memoryRequest) || above(f.memoryLimit, d.memoryLimit, saved.memoryLimit);
}

/** `customResources`: the plan allows resources above the defaults (undefined = unknown, not checked here). */
export function validateForm(f: ContainerForm, saved: WebAppContainer, customResources?: boolean): string[] {
  const errors: string[] = [];
  if (f.cpuRequest > f.cpuLimit) errors.push('CPU request cannot exceed the limit.');
  if (f.memoryRequest > f.memoryLimit) errors.push('Memory request cannot exceed the limit.');
  if (customResources === false && exceedsAllowance(f, saved)) {
    const d = DEFAULT_RESOURCES;
    errors.push(`Your plan allows up to ${d.cpuLimit}m CPU and ${d.memoryRequest}Mi / ${d.memoryLimit}Mi memory (request / limit), or your current values. Upgrade to a paid plan for more.`);
  }
  return errors;
}
