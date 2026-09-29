import { describe, expect, it } from 'vitest';
import { defaultProbeForm, formToProbe, isProbeFormValid, probeToForm, validatePath, validatePort } from './probeFormState';

describe('validatePort', () => {
  it('requires a value', () => expect(validatePort('  ')).toBeDefined());
  it('rejects non-numeric and out of range', () => {
    expect(validatePort('80a')).toBeDefined();
    expect(validatePort('0')).toBeDefined();
    expect(validatePort('70000')).toBeDefined();
  });
  it('accepts valid ports', () => expect(validatePort('8080')).toBeUndefined());
});

describe('validatePath', () => {
  it('requires a leading slash', () => {
    expect(validatePath('')).toBeDefined();
    expect(validatePath('healthz')).toBeDefined();
    expect(validatePath('/healthz')).toBeUndefined();
  });
});

describe('probe form round trip', () => {
  it('keeps only the selected mechanism', () => {
    const probe = formToProbe({ ...defaultProbeForm(), type: 'tcp', port: '3000' });
    expect(probe.tcpSocket).toEqual({ port: 3000 });
    expect(probe.httpGet).toBeUndefined();
    expect(probeToForm(probe).port).toBe('3000');
  });
  it('drops blank exec commands', () => {
    const probe = formToProbe({ ...defaultProbeForm(), type: 'exec', command: ['cat', ' ', '/tmp/ok'] });
    expect(probe.exec?.command).toEqual(['cat', '/tmp/ok']);
  });
});

describe('isProbeFormValid', () => {
  it('requires header keys and values', () => {
    const form = { ...defaultProbeForm(), httpHeaders: [{ name: 'Accept', value: '' }] };
    expect(isProbeFormValid(form)).toBe(false);
  });
  it('requires an exec command', () => {
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'exec' })).toBe(false);
    expect(isProbeFormValid({ ...defaultProbeForm(), type: 'exec', command: ['ls'] })).toBe(true);
  });
});
