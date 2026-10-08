import { afterEach, describe, expect, it } from 'vitest';
import { getSessionOrgHandle, resolveOrgHandle, saveOidcAuthMetadata } from './tokenManager';
import { withOrg } from '../paths';

const setOrg = (orgHandle: string) => {
  (window as unknown as { API_CONFIG: Record<string, unknown> }).API_CONFIG = { ...(window.API_CONFIG ?? {}), orgHandle };
};

describe('resolveOrgHandle', () => {
  afterEach(() => localStorage.clear());

  it('prefers the configured ORG_HANDLE over the token org (local OpenChoreo)', () => {
    setOrg('default');
    expect(resolveOrgHandle('amiladesilva')).toBe('default');
    expect(resolveOrgHandle(undefined)).toBe('default');
  });

  it('uses the token org when nothing is configured (WSO2 Cloud)', () => {
    setOrg('');
    expect(resolveOrgHandle('acme')).toBe('acme');
    expect(resolveOrgHandle(undefined)).toBeUndefined();
    expect(resolveOrgHandle('')).toBeUndefined();
  });
});

describe('getSessionOrgHandle', () => {
  afterEach(() => localStorage.clear());

  it('corrects a session saved with the token org once ORG_HANDLE is configured', () => {
    saveOidcAuthMetadata('amiladesilva');
    setOrg('default');
    expect(getSessionOrgHandle()).toBe('default');
  });

  it('returns the saved org without a configured one', () => {
    setOrg('');
    expect(getSessionOrgHandle()).toBeUndefined();
    saveOidcAuthMetadata('acme');
    expect(getSessionOrgHandle()).toBe('acme');
  });
});

describe('withOrg', () => {
  it('replaces the org segment and keeps the rest', () => {
    expect(withOrg('/organizations/amiladesilva', 'default')).toBe('/organizations/default');
    expect(withOrg('/organizations/a/projects/p/home?track=x#y', 'default')).toBe('/organizations/default/projects/p/home?track=x#y');
  });
  it('leaves other paths unchanged', () => {
    expect(withOrg('/login', 'default')).toBe('/login');
    expect(withOrg('/organizationsx/a', 'default')).toBe('/organizationsx/a');
  });
});
