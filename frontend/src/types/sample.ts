import type { BuildPreset } from './webApp';

export interface Sample {
  id: string;
  name: string;
  framework: string;
  description: string;
  repoUrl: string;
  branch: string;
  componentDirectory: string;
  buildPreset: BuildPreset;
  /** SPA presets only (see `constants/buildPresets`). */
  buildCommand?: string;
  buildPath?: string;
  nodeVersion?: string;
  port: number;
}
