export interface Sample {
  id: string;
  name: string;
  framework: string;
  description: string;
  repoUrl: string;
  branch: string;
  componentDirectory: string;
  buildPreset: import('./webApp').BuildPreset;
  buildCommand: string;
  buildPath: string;
  port: number;
}
