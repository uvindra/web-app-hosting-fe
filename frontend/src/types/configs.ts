export type ConfigKind = 'config' | 'secret';

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
  entries: ConfigEntry[];
  updatedAt: string;
}

export interface ConfigWrite {
  name: string;
  kind: ConfigKind;
  /** Secret entries with `masked` and an empty value keep their stored value. */
  entries: ConfigEntry[];
}
