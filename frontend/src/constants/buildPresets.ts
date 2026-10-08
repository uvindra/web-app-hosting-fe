import type { BuildPreset, CreateWebAppGitInput } from '../types/webApp';

/** Presets built by the SPA/static workflow and served by nginx-unprivileged (config.js lives in its web root). */
export const SPA_PRESETS: readonly BuildPreset[] = ['react', 'angular', 'vuejs', 'static'];

/** The nginx-unprivileged web root SPA files (e.g. config.js) are mounted into. */
export const SPA_WEB_ROOT = '/usr/share/nginx/html';

/** The port nginx-unprivileged serves SPA/static apps on (the BFF fixes it). */
export const SPA_PORT = 8080;

export function isSpaPreset(preset: BuildPreset | undefined): boolean {
  return !!preset && SPA_PRESETS.includes(preset);
}

/**
 * How the BFF builds a preset, which decides the build fields that apply:
 * - `spa` (React/Angular/Vue): build command, output directory, Node version; served on 8080.
 * - `static`: no build; only the directory to serve; served on 8080.
 * - `docker`: Dockerfile path + build context (both relative to the component directory) and the port.
 * - `buildpack` (Paketo: NodeJS, Python, Go, …): the port only, plus an optional Node version for NodeJS.
 */
export type PresetKind = 'spa' | 'static' | 'docker' | 'buildpack';

export function presetKind(preset: BuildPreset): PresetKind {
  if (preset === 'static') return 'static';
  if (preset === 'docker') return 'docker';
  if (isSpaPreset(preset)) return 'spa';
  return 'buildpack';
}

/** The form's build fields (all strings, as typed). */
export interface BuildFieldValues {
  buildCommand: string;
  /** SPA output directory, or the static site's directory to serve. */
  buildPath: string;
  nodeVersion: string;
  dockerfilePath: string;
  dockerContext: string;
  port: string;
}

const SPA_OUTPUT_DIR: Partial<Record<BuildPreset, string>> = { react: '/build', angular: '/dist', vuejs: '/dist' };

/** Defaults shown when a preset is picked. */
export function presetDefaults(preset: BuildPreset, port = String(SPA_PORT)): BuildFieldValues {
  const base: BuildFieldValues = { buildCommand: '', buildPath: '', nodeVersion: '', dockerfilePath: '', dockerContext: '', port };
  switch (presetKind(preset)) {
    case 'spa':
      return { ...base, buildCommand: 'npm run build', buildPath: SPA_OUTPUT_DIR[preset] ?? '/dist', nodeVersion: '20', port: String(SPA_PORT) };
    case 'static':
      return { ...base, buildPath: '/', port: String(SPA_PORT) };
    case 'docker':
      return { ...base, dockerfilePath: 'Dockerfile', dockerContext: '.' };
    default:
      return base;
  }
}

/** Whether the preset takes an (optional) Node.js version. */
export function usesNodeVersion(preset: BuildPreset): boolean {
  return presetKind(preset) === 'spa' || preset === 'nodejs';
}

type BuildInputFields = Pick<CreateWebAppGitInput, 'buildCommand' | 'buildPath' | 'nodeVersion' | 'port' | 'docker'>;

/** The create-request build fields for a preset: only what the BFF uses for it. */
export function toBuildInput(preset: BuildPreset, v: BuildFieldValues): BuildInputFields {
  const nodeVersion = usesNodeVersion(preset) ? v.nodeVersion.trim() || undefined : undefined;
  switch (presetKind(preset)) {
    case 'spa':
      return { buildCommand: v.buildCommand.trim(), buildPath: v.buildPath.trim(), nodeVersion, port: SPA_PORT };
    case 'static':
      return { buildPath: v.buildPath.trim() || '/', port: SPA_PORT };
    case 'docker':
      return { docker: { filePath: v.dockerfilePath.trim() || 'Dockerfile', context: v.dockerContext.trim() || '.' }, port: Number(v.port) };
    default:
      return { nodeVersion, port: Number(v.port) };
  }
}
