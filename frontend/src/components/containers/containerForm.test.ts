import { describe, expect, it } from 'vitest';
import type { WebAppContainer } from '../../types/containers';
import { DEFAULT_RESOURCES, containerToForm, exceedsAllowance, formToUpdate, isFormDirty, splitLines, validateForm } from './containerForm';

const container: WebAppContainer = {
  id: 'c1',
  name: 'web',
  image: 'img:1',
  imagePullPolicy: 'IfNotPresent',
  ports: [{ protocol: 'TCP', port: 8080 }],
  cpuRequest: 100,
  cpuLimit: 500,
  memoryRequest: 128,
  memoryLimit: 256,
  command: [],
  args: ['nginx', '-g', 'daemon off;'],
  updatedAt: '',
};

describe('containerForm', () => {
  it('splits lines, dropping blanks', () => expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']));
  it('round-trips a container', () => {
    const f = containerToForm(container);
    expect(formToUpdate(f).args).toEqual(container.args);
    expect(isFormDirty(f, container)).toBe(false);
    expect(isFormDirty({ ...f, cpuLimit: 600 }, container)).toBe(true);
  });
  it('validates request <= limit', () => {
    const f = containerToForm(container);
    expect(validateForm(f, container)).toEqual([]);
    expect(validateForm({ ...f, cpuRequest: 900 }, container)).toHaveLength(1);
  });
});

describe('plan gating', () => {
  const atDefaults: WebAppContainer = { ...container, ...DEFAULT_RESOURCES };
  const defaults = containerToForm(atDefaults);
  it('allows the defaults and less on every plan', () => {
    expect(exceedsAllowance(defaults, atDefaults)).toBe(false);
    expect(validateForm(defaults, atDefaults, false)).toEqual([]);
    expect(validateForm({ ...defaults, cpuRequest: 50, memoryRequest: 128, memoryLimit: 512 }, atDefaults, false)).toEqual([]);
  });
  it('rejects more than the defaults on a free plan only', () => {
    const more = { ...defaults, memoryLimit: 2048 };
    expect(exceedsAllowance(more, atDefaults)).toBe(true);
    expect(validateForm(more, atDefaults, false)).toHaveLength(1);
    expect(validateForm(more, atDefaults, true)).toEqual([]);
    expect(validateForm(more, atDefaults)).toEqual([]);
  });
  it('lets a downgraded org keep or lower saved above-default resources, not raise them', () => {
    const big: WebAppContainer = { ...container, cpuRequest: 500, cpuLimit: 1000, memoryRequest: 512, memoryLimit: 2048 };
    const form = containerToForm(big);
    expect(validateForm({ ...form, imagePullPolicy: 'Always' }, big, false)).toEqual([]);
    expect(validateForm({ ...form, cpuLimit: 800, memoryLimit: 1536 }, big, false)).toEqual([]);
    expect(validateForm({ ...form, cpuLimit: 1200 }, big, false)).toHaveLength(1);
    expect(validateForm({ ...form, memoryRequest: 600 }, big, false)).toHaveLength(1);
  });
});
