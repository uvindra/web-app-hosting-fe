import type { Environment } from '../types/environment';
import type { EnvironmentId } from '../types/webApp';

/** Display name of a pipeline environment (falls back to a capitalised id). */
export function environmentLabel(environments: readonly Environment[], id: EnvironmentId): string {
  const found = environments.find((e) => e.id === id);
  if (found) return found.name;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}
