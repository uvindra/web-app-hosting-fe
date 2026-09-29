import type { ConfigItem, ConfigWrite } from '../types/configs';
import type { EnvironmentId } from '../types/webApp';
import { buildConfigs, type StoredConfig } from '../mock-data/configs';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const store = new Map<string, StoredConfig[]>();
const key = (webAppId: string, env: EnvironmentId): string => `${webAppId}:${env}`;

function load(webAppId: string, env: EnvironmentId): StoredConfig[] {
  const existing = store.get(key(webAppId, env));
  if (existing) return existing;
  const fresh = buildConfigs(webAppId, env);
  store.set(key(webAppId, env), fresh);
  return fresh;
}

/** Strip the stub-only stored secret values, masking every secret entry. */
function toPublic({ secretValues, ...item }: StoredConfig): ConfigItem {
  void secretValues;
  return {
    ...item,
    entries: item.kind === 'secret' ? item.entries.map((e) => ({ key: e.key, value: '', masked: true })) : item.entries,
  };
}

function toStored(id: string, write: ConfigWrite, previous?: StoredConfig): StoredConfig {
  const secretValues: Record<string, string> = {};
  const entries = write.entries.map((e) => {
    if (write.kind !== 'secret') return { key: e.key, value: e.value };
    secretValues[e.key] = e.masked && e.value === '' ? (previous?.secretValues?.[e.key] ?? '') : e.value;
    return { key: e.key, value: '', masked: true };
  });
  return { id, name: write.name, kind: write.kind, entries, updatedAt: new Date().toISOString(), secretValues: write.kind === 'secret' ? secretValues : undefined };
}

export async function fetchConfigs(webAppId: string, env: EnvironmentId): Promise<ConfigItem[]> {
  await delay(NETWORK_DELAY_MS);
  return load(webAppId, env).map(toPublic);
}

export async function createConfig(webAppId: string, env: EnvironmentId, write: ConfigWrite): Promise<ConfigItem> {
  await delay(NETWORK_DELAY_MS);
  const list = load(webAppId, env);
  if (list.some((c) => c.name === write.name)) throw new Error(`A config or secret named '${write.name}' already exists.`);
  const created = toStored(`${webAppId}-${env}-${write.name}-${Date.now()}`, write);
  store.set(key(webAppId, env), [...list, created]);
  return toPublic(created);
}

export async function updateConfig(webAppId: string, env: EnvironmentId, id: string, write: ConfigWrite): Promise<ConfigItem> {
  await delay(NETWORK_DELAY_MS);
  const list = load(webAppId, env);
  const previous = list.find((c) => c.id === id);
  if (!previous) throw new Error('Config not found.');
  if (list.some((c) => c.id !== id && c.name === write.name)) throw new Error(`A config or secret named '${write.name}' already exists.`);
  const next = toStored(id, write, previous);
  store.set(
    key(webAppId, env),
    list.map((c) => (c.id === id ? next : c)),
  );
  return toPublic(next);
}

export async function deleteConfig(webAppId: string, env: EnvironmentId, id: string): Promise<void> {
  await delay(NETWORK_DELAY_MS);
  store.set(
    key(webAppId, env),
    load(webAppId, env).filter((c) => c.id !== id),
  );
}
