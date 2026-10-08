import { describe, expect, it, vi } from 'vitest';
import { createFromSample, sampleToInput, suffixedHandle } from './sampleInput';
import { HttpError } from '../types/http';
import { MOCK_SAMPLES } from '../mock-data/samples';
import type { Sample } from '../types/sample';
import type { CreateWebAppGitInput, WebApp } from '../types/webApp';

const sample: Sample = {
  id: 's',
  name: 'React SPA',
  framework: 'React',
  description: '',
  repoUrl: 'https://github.com/wso2/choreo-samples/tree/main/react-single-page-app',
  branch: 'main',
  componentDirectory: '/react-single-page-app',
  buildPreset: 'react',
  buildCommand: 'npm run build',
  buildPath: '/build',
  nodeVersion: '18',
  port: 8080,
};

const byId = (id: string) => MOCK_SAMPLES.find((s) => s.id === id) as Sample;

describe('sampleToInput', () => {
  it('splits a GitHub tree URL into repository + directory', () => {
    expect(sampleToInput(sample)).toEqual({
      sourceType: 'public-git',
      repository: 'https://github.com/wso2/choreo-samples',
      branch: 'main',
      componentDirectory: '/react-single-page-app',
      displayName: 'React SPA',
      handler: 'react-spa',
      buildPreset: 'react',
      buildCommand: 'npm run build',
      buildPath: '/build',
      nodeVersion: '18',
      port: 8080,
    });
  });

  it('accepts a plain repository URL', () => {
    expect(sampleToInput({ ...sample, repoUrl: 'https://github.com/acme/site', componentDirectory: '' })).toMatchObject({ repository: 'https://github.com/acme/site', componentDirectory: '/' });
  });

  it('maps every shipped sample to a public-git create with its preset fields', () => {
    expect(sampleToInput(byId('sample-vue-spa'))).toMatchObject({ buildPreset: 'vuejs', buildCommand: 'npm run build', buildPath: '/dist', nodeVersion: '18', componentDirectory: '/vue-single-page-application' });
    expect(sampleToInput(byId('sample-angular-spa'))).toMatchObject({ buildPreset: 'angular', buildPath: '/dist/angular-spa' });
    const go = sampleToInput(byId('sample-hello-world-go'));
    expect(go).toMatchObject({ sourceType: 'public-git', buildPreset: 'go', port: 8080, componentDirectory: '/hello-world-go-webapp' });
    expect(go.buildCommand).toBeUndefined();
    expect(go.buildPath).toBeUndefined();
    for (const s of MOCK_SAMPLES) expect(sampleToInput(s).repository).toBe('https://github.com/wso2/choreo-samples');
  });
});

describe('createFromSample', () => {
  const webApp = (handler: string) => ({ handler }) as WebApp;

  it('retries a name collision with a suffixed handle and returns the created web app', async () => {
    const create = vi.fn(async (input: CreateWebAppGitInput) => {
      if (input.handler === 'react-spa') throw new HttpError(409, 'a web app named "react-spa" already exists', 'CONFLICT');
      return webApp(input.handler);
    });
    const created = await createFromSample(sample, create, 3, () => 'ab12');
    expect(created.handler).toBe('react-spa-ab12');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('surfaces other errors (e.g. 402 quota) without retrying', async () => {
    const create = vi.fn(async () => {
      throw new HttpError(402, 'Quota exceeded', 'QUOTA_EXCEEDED');
    });
    await expect(createFromSample(sample, create)).rejects.toMatchObject({ status: 402 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempts', async () => {
    const create = vi.fn(async () => {
      throw new HttpError(409, 'conflict', 'CONFLICT');
    });
    await expect(createFromSample(sample, create, 2)).rejects.toMatchObject({ status: 409 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('keeps suffixed handles within 40 characters', () => {
    expect(suffixedHandle('a'.repeat(40), 'ab12')).toHaveLength(40);
    expect(suffixedHandle('react-spa', 'ab12')).toBe('react-spa-ab12');
  });
});
