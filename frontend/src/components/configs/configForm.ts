import type { ConfigEntry, ConfigItem, ConfigKind, ConfigWrite } from '../../types/configs';

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export function validateName(name: string): string {
  if (!name.trim()) return 'Name is required.';
  if (name.length > 63) return 'Name must be 63 characters or fewer.';
  if (!NAME_RE.test(name)) return 'Use lowercase letters, numbers and hyphens; start and end with a letter or number.';
  return '';
}

export function validateKey(key: string): string {
  if (!key.trim()) return 'Key is required.';
  if (key.length > 250) return 'Key must be 250 characters or fewer.';
  if (!ENV_KEY_RE.test(key)) return 'Use letters, numbers and underscores; must not start with a number.';
  return '';
}

/** Parse a `.env` file body into entries, skipping comments and blanks. */
export function parseDotEnv(text: string): ConfigEntry[] {
  const rows: ConfigEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    rows.push({ key, value });
  }
  return rows;
}

export interface ConfigFormState {
  name: string;
  kind: ConfigKind;
  entries: ConfigEntry[];
}

export function emptyForm(): ConfigFormState {
  return { name: '', kind: 'config', entries: [{ key: '', value: '' }] };
}

export function itemToForm(item: ConfigItem): ConfigFormState {
  return { name: item.name, kind: item.kind, entries: item.entries.map((e) => ({ ...e })) };
}

/** Human-readable problems that block saving; empty when valid. */
export function validateForm(form: ConfigFormState, isEdit: boolean): string[] {
  const errors: string[] = [];
  if (!isEdit) {
    const nameError = validateName(form.name);
    if (nameError) errors.push(nameError);
  }
  if (form.entries.length === 0) errors.push('Add at least one key.');
  const seen = new Set<string>();
  for (const e of form.entries) {
    const keyError = validateKey(e.key);
    if (keyError) {
      errors.push(keyError);
      continue;
    }
    if (seen.has(e.key)) errors.push(`Duplicate key '${e.key}'.`);
    seen.add(e.key);
    if (!(e.masked && e.value === '') && e.value === '') errors.push(`Value for '${e.key}' is required.`);
  }
  return errors;
}

export function formToWrite(form: ConfigFormState): ConfigWrite {
  return { name: form.name, kind: form.kind, entries: form.entries };
}
