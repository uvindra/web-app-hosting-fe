import { describe, expect, it } from 'vitest';
import { sampleToInput } from './sampleInput';
import type { Sample } from '../types/sample';

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
  port: 8080,
};

describe('sampleToInput', () => {
  it('splits a GitHub tree URL into repository + directory', () => {
    expect(sampleToInput(sample)).toMatchObject({
      sourceType: 'public-git',
      repository: 'https://github.com/wso2/choreo-samples',
      branch: 'main',
      componentDirectory: '/react-single-page-app',
      handler: 'react-spa',
      buildPreset: 'react',
    });
  });
  it('accepts a plain repository URL', () => {
    expect(sampleToInput({ ...sample, repoUrl: 'https://github.com/acme/site', componentDirectory: '' })).toMatchObject({ repository: 'https://github.com/acme/site', componentDirectory: '/' });
  });
});
