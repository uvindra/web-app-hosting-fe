import { describe, expect, it } from 'vitest';
import type { WebAppContainer } from '../../types/containers';
import { containerToForm, formToUpdate, isFormDirty, splitLines, validateForm } from './containerForm';

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
