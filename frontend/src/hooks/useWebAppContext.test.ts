import { describe, expect, it } from 'vitest';
import { resolveTrack } from './useWebAppContext';
import { withoutTrack } from '../paths';
import type { DeploymentTrack } from '../types/deploymentTracks';

const t = (id: string): DeploymentTrack => ({ id, branch: id, isDefault: id === 'site', autoDeploy: false, deployed: false, createdAt: '' });

describe('resolveTrack', () => {
  const tracks = [t('site'), t('site--b1')];
  it('uses the default track without a ?track=', () => {
    expect(resolveTrack(null, 'site', undefined)).toEqual({ trackId: 'site', stale: false });
  });
  it('uses a requested track the web app has', () => {
    expect(resolveTrack('site--b1', 'site', tracks)).toEqual({ trackId: 'site--b1', stale: false });
  });
  it('falls back to the default for an unknown (e.g. just deleted) track', () => {
    expect(resolveTrack('site--gone', 'site', tracks)).toEqual({ trackId: 'site', stale: true });
  });
  it('trusts the requested track when the track list is unavailable', () => {
    expect(resolveTrack('site--b1', 'site', undefined)).toEqual({ trackId: 'site--b1', stale: false });
  });
});

describe('withoutTrack', () => {
  it('drops only the track param', () => {
    expect(withoutTrack({ pathname: '/a/build', search: '?track=x&env=dev', hash: '#h' })).toBe('/a/build?env=dev#h');
    expect(withoutTrack({ pathname: '/a/build', search: '?track=x', hash: '' })).toBe('/a/build');
  });
});
