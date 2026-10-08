import { afterEach, describe, expect, it } from 'vitest';
import { getAndClearRedirectUrl, saveRedirectUrl } from './tokenManager';

const setOrg = (orgHandle: string) => {
  (window as unknown as { API_CONFIG: Record<string, unknown> }).API_CONFIG = { ...(window.API_CONFIG ?? {}), orgHandle };
};

describe('saveRedirectUrl / getAndClearRedirectUrl', () => {
  afterEach(() => localStorage.clear());

  it('stores an absolute same-origin URL as an in-app path', () => {
    setOrg('');
    saveRedirectUrl(`${window.location.origin}/organizations/acme/projects/p1?track=main#top`);
    expect(getAndClearRedirectUrl()).toBe('/organizations/acme/projects/p1?track=main#top');
    expect(getAndClearRedirectUrl()).toBeNull();
  });

  it('drops cross-origin URLs', () => {
    setOrg('');
    saveRedirectUrl('https://evil.example.com/organizations/acme');
    expect(getAndClearRedirectUrl()).toBeNull();
  });

  it("skips the synthetic 'default' org unless it is the configured org", () => {
    setOrg('');
    saveRedirectUrl(`${window.location.origin}/organizations/default/projects`);
    expect(getAndClearRedirectUrl()).toBeNull();
    setOrg('default');
    saveRedirectUrl(`${window.location.origin}/organizations/default/projects`);
    expect(getAndClearRedirectUrl()).toBe('/organizations/default/projects');
  });
});

describe('getAndClearRedirectUrl with a configured org', () => {
  afterEach(() => localStorage.clear());

  it("moves a path saved under another org (e.g. the user's ouHandle) to the configured org", () => {
    setOrg('');
    saveRedirectUrl(`${window.location.origin}/organizations/amiladesilva/projects/p1/home?track=main`);
    setOrg('default');
    expect(getAndClearRedirectUrl()).toBe('/organizations/default/projects/p1/home?track=main');
  });

  it('leaves non-org paths alone', () => {
    setOrg('default');
    saveRedirectUrl(`${window.location.origin}/somewhere`);
    expect(getAndClearRedirectUrl()).toBe('/somewhere');
  });

  it('keeps the org from the path on WSO2 Cloud (no configured org)', () => {
    setOrg('');
    saveRedirectUrl(`${window.location.origin}/organizations/acme/projects`);
    expect(getAndClearRedirectUrl()).toBe('/organizations/acme/projects');
  });
});
