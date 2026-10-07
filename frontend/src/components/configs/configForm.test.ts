import { describe, expect, it } from 'vitest';
import { formToWrite, parseDotEnv, validateForm, validateKey, validateName } from './configForm';

describe('configForm', () => {
  it('validates names', () => {
    expect(validateName('app-config')).toBe('');
    expect(validateName('App')).not.toBe('');
    expect(validateName('')).not.toBe('');
  });
  it('validates env keys', () => {
    expect(validateKey('API_BASE_URL')).toBe('');
    expect(validateKey('1BAD')).not.toBe('');
    expect(validateKey('a-b')).not.toBe('');
  });
  it('parses .env text', () => {
    expect(parseDotEnv('# c\nA=1\nB="two words"\n\nbad\nC=x=y')).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two words' },
      { key: 'C', value: 'x=y' },
    ]);
  });
  it('flags duplicates and empty values but allows kept masked secrets', () => {
    const errs = validateForm(
      {
        name: 'a',
        kind: 'secret',
        mountPath: '',
        entries: [
          { key: 'K', value: '', masked: true },
          { key: 'K', value: 'v' },
          { key: 'J', value: '' },
        ],
      },
      true,
    );
    expect(errs).toEqual(["Duplicate key 'K'.", "Value for 'J' is required."]);
  });
  it('validates a file config (e.g. SPA config.js)', () => {
    const ok = { name: 'runtime-config', kind: 'file' as const, mountPath: '/usr/share/nginx/html', entries: [{ key: 'config.js', value: 'window.configs = {};' }] };
    expect(validateForm(ok, false)).toEqual([]);
    expect(formToWrite(ok)).toEqual({ name: 'runtime-config', kind: 'file', mountPath: '/usr/share/nginx/html', entries: [{ key: 'config.js', value: 'window.configs = {};' }] });
    expect(validateForm({ ...ok, mountPath: 'relative' }, false)).toHaveLength(1);
    expect(validateForm({ ...ok, entries: [{ key: 'bad name', value: '' }] }, false)).toHaveLength(1);
  });
});
