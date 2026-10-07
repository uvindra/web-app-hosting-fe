import { describe, expect, it } from 'vitest';
import { parseDotEnv, validateForm, validateKey, validateName } from './configForm';

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
});
