import { memo, useCallback, useState, type ChangeEvent, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, IconButton, Radio, RadioGroup, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Plus, Trash2, Upload } from '@wso2/oxygen-ui-icons-react';
import MemoTextField from '../MemoTextField';
import { useSaveConfig } from '../../hooks/useConfigs';
import { emptyForm, formToWrite, itemToForm, parseDotEnv, validateFileName, validateForm, validateKey, validateName } from './configForm';
import { SPA_WEB_ROOT } from '../../constants/buildPresets';
import type { ConfigEntry, ConfigItem, ConfigKind } from '../../types/configs';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

type InputChange = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type EntryPatch = Partial<Pick<ConfigEntry, 'key' | 'value'>>;

// Hoisted so the memoised fields below see the same props on every render (see MemoTextField).
const fieldWidthSx = { maxWidth: 520 };
const envTextSx = { mb: 1 };
const keySx = { flex: 1 };
const valueSx = { flex: 2 };
const monospaceSlotProps = { input: { sx: { fontFamily: 'monospace' } } };

interface ConfigEditorProps {
  track: TrackRef;
  environment: EnvironmentId;
  existing?: ConfigItem;
  /** SPA/static web apps: file configs default to the nginx web root (for config.js). */
  isSpa?: boolean;
  onBack: () => void;
  onSaved: (message: string) => void;
}

export default function ConfigEditor({ track, environment, existing, isSpa = false, onBack, onSaved }: ConfigEditorProps): JSX.Element {
  const isEdit = !!existing;
  const [form, setForm] = useState(() => (existing ? itemToForm(existing) : emptyForm(isSpa ? SPA_WEB_ROOT : '')));
  const [showErrors, setShowErrors] = useState(false);
  const [envText, setEnvText] = useState('');
  const [importing, setImporting] = useState(false);
  const save = useSaveConfig(track, environment);
  const isSecret = form.kind === 'secret';
  const isFile = form.kind === 'file';
  // A file config holds exactly one entry (switching to "File" keeps or creates it).
  const fileEntry = form.entries[0];
  const errors = validateForm(form, isEdit);

  // Stable callbacks (functional updates only), so typing in one field doesn't re-render the others.
  const setEntry = useCallback((i: number, patch: EntryPatch): void => setForm((p) => ({ ...p, entries: p.entries.map((e, idx) => (idx === i ? { ...e, ...patch, masked: 'value' in patch ? undefined : e.masked } : e)) })), []);
  const removeEntry = useCallback((i: number): void => setForm((p) => ({ ...p, entries: p.entries.filter((_, idx) => idx !== i) })), []);
  const onNameChange = useCallback((e: InputChange): void => setForm((p) => ({ ...p, name: e.target.value })), []);
  const onMountPathChange = useCallback((e: InputChange): void => setForm((p) => ({ ...p, mountPath: e.target.value })), []);
  const onFileNameChange = useCallback((e: InputChange): void => setEntry(0, { key: e.target.value }), [setEntry]);
  const onFileContentChange = useCallback((e: InputChange): void => setEntry(0, { value: e.target.value }), [setEntry]);
  const onEnvTextChange = useCallback((e: InputChange): void => setEnvText(e.target.value), []);

  const importEnv = (): void => {
    const parsed = parseDotEnv(envText);
    setForm((p) => {
      const kept = p.entries.filter((e) => e.key.trim() !== '' || e.value !== '');
      const merged = [...kept.filter((e) => !parsed.some((n) => n.key === e.key)), ...parsed];
      return { ...p, entries: merged.length ? merged : [{ key: '', value: '' }] };
    });
    setEnvText('');
    setImporting(false);
  };

  const onSubmit = (): void => {
    setShowErrors(true);
    if (errors.length > 0) return;
    save.mutate({ id: existing?.id, write: formToWrite(form) }, { onSuccess: () => onSaved(isEdit ? `'${form.name}' updated.` : `'${form.name}' created.`) });
  };

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ px: 0, mb: 3 }}>
        Go Back
      </Button>
      <Typography variant="h6" sx={{ mb: 3 }}>
        {isEdit ? `Edit ${existing.name}` : 'Create config, secret or file'}
      </Typography>

      <Stack gap={3} sx={{ mb: 3, maxWidth: 520 }}>
        <MemoTextField label="Name" value={form.name} onChange={onNameChange} disabled={isEdit} required error={showErrors && !isEdit && !!validateName(form.name)} helperText={showErrors && !isEdit ? validateName(form.name) : undefined} fullWidth />
        <Box>
          <Typography variant="subtitle2">Type</Typography>
          <RadioGroup row value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as ConfigKind, entries: e.target.value !== 'file' ? p.entries : p.entries.length > 0 ? p.entries.slice(0, 1) : [{ key: '', value: '' }] }))}>
            <FormControlLabel value="config" control={<Radio />} label="Config (environment variables)" disabled={isEdit} />
            <FormControlLabel value="secret" control={<Radio />} label="Secret" disabled={isEdit} />
            <FormControlLabel value="file" control={<Radio />} label={isSpa ? 'File (e.g. config.js)' : 'File'} disabled={isEdit} />
          </RadioGroup>
        </Box>
      </Stack>

      {isFile ? (
        fileEntry && (
          <Stack gap={2} sx={{ mb: 2 }}>
            <MemoTextField
              label="Mount directory"
              value={form.mountPath}
              onChange={onMountPathChange}
              helperText={isSpa ? `${SPA_WEB_ROOT} serves the file at /<file name> (e.g. /config.js).` : 'Absolute directory inside the container.'}
              fullWidth
              sx={fieldWidthSx}
            />
            <MemoTextField
              label="File name"
              value={fileEntry.key}
              onChange={onFileNameChange}
              error={showErrors && !!validateFileName(fileEntry.key)}
              helperText={showErrors ? validateFileName(fileEntry.key) || undefined : undefined}
              placeholder="config.js"
              sx={fieldWidthSx}
            />
            <MemoTextField label="Content" value={fileEntry.value} onChange={onFileContentChange} multiline minRows={8} placeholder="window.configs = { apiUrl: 'https://api.example.com' };" fullWidth slotProps={monospaceSlotProps} />
          </Stack>
        )
      ) : (
        <>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">Environment variables</Typography>
            <Button size="small" startIcon={<Upload size={14} />} onClick={() => setImporting((v) => !v)}>
              Import .env
            </Button>
          </Stack>
          {importing && (
            <Box sx={{ mb: 2 }}>
              <MemoTextField label=".env contents" placeholder="API_BASE_URL=https://api.example.com" multiline minRows={4} value={envText} onChange={onEnvTextChange} fullWidth sx={envTextSx} />
              <Button size="small" variant="outlined" onClick={importEnv} disabled={envText.trim() === ''}>
                Add entries
              </Button>
            </Box>
          )}

          <Stack gap={1.5} sx={{ mb: 2 }}>
            {form.entries.map((entry, i) => (
              <EntryRow key={i} index={i} entry={entry} isSecret={isSecret} showErrors={showErrors} onChange={setEntry} onRemove={removeEntry} />
            ))}
          </Stack>
          <Button size="small" startIcon={<Plus size={14} />} onClick={() => setForm((p) => ({ ...p, entries: [...p.entries, { key: '', value: '' }] }))}>
            Add key
          </Button>
        </>
      )}

      {showErrors && errors.length > 0 && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errors[0]}
        </Alert>
      )}
      {save.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {save.error instanceof Error ? save.error.message : 'Failed to save.'}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isEdit ? 'Save Changes' : 'Create'}
        </Button>
      </Stack>
    </Box>
  );
}

interface EntryRowProps {
  index: number;
  entry: ConfigEntry;
  isSecret: boolean;
  showErrors: boolean;
  onChange: (index: number, patch: EntryPatch) => void;
  onRemove: (index: number) => void;
}

/** One key/value row; memoised so typing in a row doesn't re-render the other rows' fields. */
const EntryRow = memo(function EntryRow({ index, entry, isSecret, showErrors, onChange, onRemove }: EntryRowProps): JSX.Element {
  const keyError = showErrors ? validateKey(entry.key) : '';
  const onKeyChange = useCallback((e: InputChange) => onChange(index, { key: e.target.value }), [index, onChange]);
  const onValueChange = useCallback((e: InputChange) => onChange(index, { value: e.target.value }), [index, onChange]);
  return (
    <Stack direction="row" gap={1.5} alignItems="flex-start">
      <MemoTextField size="small" label="Key" value={entry.key} onChange={onKeyChange} error={!!keyError} helperText={keyError || undefined} sx={keySx} />
      <MemoTextField size="small" label="Value" type={isSecret ? 'password' : 'text'} value={entry.value} placeholder={entry.masked ? '•••••••• (unchanged)' : undefined} autoComplete="off" onChange={onValueChange} sx={valueSx} />
      <IconButton aria-label={`Remove ${entry.key || 'entry'}`} color="error" onClick={() => onRemove(index)}>
        <Trash2 size={16} />
      </IconButton>
    </Stack>
  );
});
