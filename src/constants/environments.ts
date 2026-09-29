import type { EnvironmentId } from '../types/webApp';

export const ENVIRONMENT_IDS: readonly EnvironmentId[] = ['development', 'production'];

export const ENVIRONMENT_LABEL: Record<EnvironmentId, string> = {
  development: 'Development',
  production: 'Production',
};
