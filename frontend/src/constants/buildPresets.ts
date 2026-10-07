import type { BuildPreset } from '../types/webApp';

/** Presets built by the SPA/static workflow and served by nginx-unprivileged (config.js lives in its web root). */
export const SPA_PRESETS: readonly BuildPreset[] = ['react', 'angular', 'vuejs', 'static'];

/** The nginx-unprivileged web root SPA files (e.g. config.js) are mounted into. */
export const SPA_WEB_ROOT = '/usr/share/nginx/html';

export function isSpaPreset(preset: BuildPreset | undefined): boolean {
  return !!preset && SPA_PRESETS.includes(preset);
}
