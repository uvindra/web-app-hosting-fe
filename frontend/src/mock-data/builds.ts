import type { Build } from '../types/webApp';
import type { BuildConfig, BuildRun, BuildStep } from '../types/build';

const HOURS = 60 * 60 * 1000;
const now = Date.now();

/** Keyed by webApp id. Newly-created web apps simply have no entry (→ empty array), matching "No builds yet." */
export const MOCK_BUILDS: Record<string, Build[]> = {
  'webapp-my-portfolio': [
    {
      id: 'build-my-portfolio-1',
      status: 'success',
      commitSha: '7fb07eb',
      commitMessage: 'Add test message to readme',
      triggeredAt: new Date(now - 2 * HOURS).toISOString(),
    },
  ],
  'webapp-admin-dashboard': [
    {
      id: 'build-admin-dashboard-1',
      status: 'success',
      commitSha: 'a3c9f21',
      commitMessage: 'Update dashboard widgets',
      triggeredAt: new Date(now - 25 * HOURS).toISOString(),
    },
  ],
};

// ---- Richer build-run data for the Build page (types in src/types/build.ts) ----

const MINUTES = 60 * 1000;

const buildSteps = (failedAt?: string): BuildStep[] => {
  const defs: Array<[string, string[]]> = [
    ['Clone repository', ['Cloning into workspace...', 'Checked out branch main']],
    ['Install dependencies', ['> npm ci', 'added 1243 packages in 21s']],
    ['Build web app', ['> npm run build', 'vite v7 building for production...', '✓ 128 modules transformed.', 'dist/index.html  0.46 kB', 'dist/assets/index.js  212.4 kB']],
    ['Package and push image', ['Packaging dist/ into runtime image', 'Pushed image to registry']],
  ];
  let failed = false;
  return defs.map(([name, logs]) => {
    if (failed) return { name, status: 'pending', logs: [] };
    if (name === failedAt) {
      failed = true;
      return { name, status: 'failed', logs: [...logs.slice(0, 1), 'Error: build script exited with code 1'] };
    }
    return { name, status: 'success', logs };
  });
};

const inProgressSteps = (): BuildStep[] => [
  { name: 'Clone repository', status: 'success', logs: ['Cloning into workspace...', 'Checked out branch main'] },
  { name: 'Install dependencies', status: 'in-progress', logs: ['> npm ci'] },
  { name: 'Build web app', status: 'pending', logs: [] },
  { name: 'Package and push image', status: 'pending', logs: [] },
];

/** Keyed by webApp id; ids without an entry fall back to an empty history. */
export const MOCK_BUILD_RUNS: Record<string, BuildRun[]> = {
  'webapp-my-portfolio': [
    {
      id: 'build-my-portfolio-1',
      status: 'success',
      commitSha: '7fb07eb',
      commitMessage: 'Add test message to readme',
      author: 'Amila De Silva',
      branch: 'main',
      triggeredAt: new Date(now - 2 * HOURS).toISOString(),
      completedAt: new Date(now - 2 * HOURS + 95 * 1000).toISOString(),
      steps: buildSteps(),
    },
    {
      id: 'build-my-portfolio-0',
      status: 'failed',
      commitSha: '3d1e9a0',
      commitMessage: 'Refactor navbar component',
      author: 'Amila De Silva',
      branch: 'main',
      triggeredAt: new Date(now - 30 * HOURS).toISOString(),
      completedAt: new Date(now - 30 * HOURS + 40 * 1000).toISOString(),
      steps: buildSteps('Build web app'),
    },
  ],
  'webapp-admin-dashboard': [
    {
      id: 'build-admin-dashboard-1',
      status: 'success',
      commitSha: 'a3c9f21',
      commitMessage: 'Update dashboard widgets',
      author: 'Amila De Silva',
      branch: 'main',
      triggeredAt: new Date(now - 25 * HOURS).toISOString(),
      completedAt: new Date(now - 25 * HOURS + 3 * MINUTES).toISOString(),
      steps: buildSteps(),
    },
  ],
};

export const buildInProgressSteps = inProgressSteps;

export const DEFAULT_BUILD_CONFIG: BuildConfig = {
  repoUrl: '',
  branch: 'main',
  componentDirectory: '/',
  buildPreset: 'react',
  buildCommand: 'npm run build',
  buildPath: 'dist',
  nodeVersion: '20',
  port: 8080,
};

export const MOCK_BUILD_CONFIGS: Record<string, BuildConfig> = {
  'webapp-my-portfolio': {
    ...DEFAULT_BUILD_CONFIG,
    repoUrl: 'https://github.com/amiladesilva/my-portfolio',
    buildPreset: 'react',
    buildCommand: 'npm run build',
    buildPath: 'build',
    nodeVersion: '20',
  },
  'webapp-admin-dashboard': {
    ...DEFAULT_BUILD_CONFIG,
    repoUrl: 'https://github.com/amiladesilva/admin-dashboard',
    buildPreset: 'nodejs',
    buildCommand: 'npm run build',
    buildPath: '.next',
    nodeVersion: '22',
    port: 3000,
  },
};
