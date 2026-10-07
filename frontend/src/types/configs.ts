/** `config` = env vars, `secret` = env vars from the secret store, `file` = one mounted file (e.g. SPA `config.js`). */
export type ConfigKind = 'config' | 'secret' | 'file';

export interface ConfigEntry {
  key: string;
  /** Empty and `masked` for stored secret values, which are never returned by the API. */
  value: string;
  masked?: boolean;
}

export interface ConfigItem {
  id: string;
  name: string;
  kind: ConfigKind;
  /** `file` kind: the directory the file is mounted in. */
  mountPath?: string;
  entries: ConfigEntry[];
  updatedAt: string;
}

export interface ConfigWrite {
  name: string;
  kind: ConfigKind;
  /** `file` kind: mount directory (defaults to the SPA web root). */
  mountPath?: string;
  /** Secret entries with `masked` and an empty value keep their stored value. */
  entries: ConfigEntry[];
}
