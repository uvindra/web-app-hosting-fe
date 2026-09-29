import { describe, expect, it } from 'vitest';
import { validateDomain } from './domain';

describe('validateDomain', () => {
  it('accepts valid domains', () => {
    expect(validateDomain('app.example.com')).toBeNull();
    expect(validateDomain(' My-Site.example.co.uk ')).toBeNull();
  });
  it('rejects invalid domains', () => {
    expect(validateDomain('')).not.toBeNull();
    expect(validateDomain('localhost')).not.toBeNull();
    expect(validateDomain('https://a.com')).not.toBeNull();
    expect(validateDomain('a.com/path')).not.toBeNull();
    expect(validateDomain('-bad.example.com')).not.toBeNull();
    expect(validateDomain('bad_.example.com')).not.toBeNull();
    expect(validateDomain('a.b.123')).not.toBeNull();
  });
});
