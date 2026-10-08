import { describe, expect, it } from 'vitest';
import { presetDefaults, presetKind, toBuildInput, usesNodeVersion } from './buildPresets';

describe('build presets', () => {
  it('classifies presets as the BFF builds them', () => {
    expect(presetKind('react')).toBe('spa');
    expect(presetKind('vuejs')).toBe('spa');
    expect(presetKind('static')).toBe('static');
    expect(presetKind('docker')).toBe('docker');
    expect(presetKind('nodejs')).toBe('buildpack');
    expect(presetKind('go')).toBe('buildpack');
  });

  it('only prefills SPA build commands for SPA presets', () => {
    expect(presetDefaults('react')).toMatchObject({ buildCommand: 'npm run build', buildPath: '/build', nodeVersion: '20' });
    expect(presetDefaults('angular').buildPath).toBe('/dist');
    expect(presetDefaults('static')).toMatchObject({ buildCommand: '', buildPath: '/', nodeVersion: '' });
    expect(presetDefaults('docker')).toMatchObject({ buildCommand: '', buildPath: '', dockerfilePath: 'Dockerfile', dockerContext: '.' });
    expect(presetDefaults('nodejs', '3000')).toMatchObject({ buildCommand: '', buildPath: '', nodeVersion: '', port: '3000' });
  });

  it('sends only the fields the BFF uses for each preset', () => {
    const v = { buildCommand: 'npm run build', buildPath: '/build', nodeVersion: '18', dockerfilePath: 'docker/Dockerfile', dockerContext: '..', port: '3000' };
    expect(toBuildInput('react', v)).toEqual({ buildCommand: 'npm run build', buildPath: '/build', nodeVersion: '18', port: 8080 });
    expect(toBuildInput('static', v)).toEqual({ buildPath: '/build', port: 8080 });
    expect(toBuildInput('docker', v)).toEqual({ docker: { filePath: 'docker/Dockerfile', context: '..' }, port: 3000 });
    expect(toBuildInput('nodejs', v)).toEqual({ nodeVersion: '18', port: 3000 });
    expect(toBuildInput('python', v)).toEqual({ nodeVersion: undefined, port: 3000 });
    expect(toBuildInput('docker', { ...v, dockerfilePath: ' ', dockerContext: '' }).docker).toEqual({ filePath: 'Dockerfile', context: '.' });
    expect(usesNodeVersion('nodejs') && !usesNodeVersion('go') && !usesNodeVersion('static')).toBe(true);
  });
});
