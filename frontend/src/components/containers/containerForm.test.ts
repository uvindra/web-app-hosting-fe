import { describe, expect, it } from 'vitest';
import type { WebAppContainer } from '../../types/containers';
import { DEFAULT_RESOURCES, containerToForm, exceedsDefaults, formToUpdate, isFormDirty, splitLines, validateForm } from './containerForm';

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
    expect(validateForm(f)).toEqual([]);
    expect(validateForm({ ...f, cpuRequest: 900 })).toHaveLength(1);
  });
});

describe('plan gating', () => {
  const defaults = { ...containerToForm(container), ...DEFAULT_RESOURCES };
  it('allows the defaults and less on every plan', () => {
    expect(exceedsDefaults(defaults)).toBe(false);
    expect(validateForm(defaults, false)).toEqual([]);
    expect(validateForm({ ...defaults, cpuRequest: 50, memoryRequest: 128, memoryLimit: 512 }, false)).toEqual([]);
  });
  it('rejects more than the defaults on a free plan only', () => {
    const more = { ...defaults, memoryLimit: 2048 };
    expect(exceedsDefaults(more)).toBe(true);
    expect(validateForm(more, false)).toHaveLength(1);
    expect(validateForm(more, true)).toEqual([]);
    expect(validateForm(more)).toEqual([]);
  });
});
