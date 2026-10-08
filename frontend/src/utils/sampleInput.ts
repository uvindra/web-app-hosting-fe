import { presetDefaults, toBuildInput } from '../constants/buildPresets';
import { HttpError } from '../types/http';
import type { CreateWebAppGitInput, WebApp } from '../types/webApp';
import type { Sample } from '../types/sample';
import { toHandler } from './toHandler';

/**
 * Turns a sample (e.g. `https://github.com/wso2/choreo-samples/tree/main/react-single-page-app`)
 * into a public-Git create input: the repository root URL plus the sample's directory, and only the
 * build fields its preset uses.
 */
export function sampleToInput(sample: Sample, handler = toHandler(sample.name)): CreateWebAppGitInput {
  const match = /^(https?:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(\/.*)?)?\/?$/.exec(sample.repoUrl);
  const repository = match ? match[1] : sample.repoUrl;
  const branch = (match && match[2]) || sample.branch || 'main';
  const directory = sample.componentDirectory || (match && match[3]) || '/';
  const defaults = presetDefaults(sample.buildPreset, String(sample.port));
  return {
    sourceType: 'public-git',
    repository,
    branch,
    componentDirectory: directory,
    displayName: sample.name,
    handler,
    buildPreset: sample.buildPreset,
    ...toBuildInput(sample.buildPreset, {
      ...defaults,
      buildCommand: sample.buildCommand ?? defaults.buildCommand,
      buildPath: sample.buildPath ?? defaults.buildPath,
      nodeVersion: sample.nodeVersion ?? defaults.nodeVersion,
    }),
  };
}

const MAX_HANDLE = 40;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/** `base-<suffix>`, kept within the BFF's 40-character name limit. */
export function suffixedHandle(base: string, suffix: string): string {
  return `${base.slice(0, MAX_HANDLE - suffix.length - 1).replace(/-+$/, '')}-${suffix}`;
}

/**
 * Creates a web app from a sample. Deploying the same sample twice collides on its name (409): retry with a
 * short random suffix, so the returned web app's `handler` may differ from the sample's — navigate to that.
 */
export async function createFromSample(sample: Sample, create: (input: CreateWebAppGitInput) => Promise<WebApp>, attempts = 3, suffix: () => string = randomSuffix): Promise<WebApp> {
  const base = toHandler(sample.name);
  let handler = base;
  for (let attempt = 1; ; attempt++) {
    try {
      return await create(sampleToInput(sample, handler));
    } catch (err) {
      const conflict = err instanceof HttpError && err.status === 409;
      if (!conflict || attempt >= attempts) throw err;
      handler = suffixedHandle(base, suffix());
    }
  }
}
