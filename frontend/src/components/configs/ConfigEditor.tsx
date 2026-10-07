import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, IconButton, Radio, RadioGroup, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Plus, Trash2, Upload } from '@wso2/oxygen-ui-icons-react';
import { useSaveConfig } from '../../hooks/useConfigs';
import { emptyForm, formToWrite, itemToForm, parseDotEnv, validateForm, validateKey, validateName } from './configForm';
import type { ConfigItem, ConfigKind } from '../../types/configs';
import type { EnvironmentId } from '../../types/webApp';

interface ConfigEditorProps {
  webAppId: string;
  environment: EnvironmentId;
  existing?: ConfigItem;
  onBack: () => void;
  onSaved: (message: string) => void;
}

export default function ConfigEditor({ webAppId, environment, existing, onBack, onSaved }: ConfigEditorProps): JSX.Element {
  const isEdit = !!existing;
  const [form, setForm] = useState(() => (existing ? itemToForm(existing) : emptyForm()));
  const [showErrors, setShowErrors] = useState(false);
  const [envText, setEnvText] = useState('');
  const [importing, setImporting] = useState(false);
  const save = useSaveConfig(webAppId, environment);
  const isSecret = form.kind === 'secret';
  const errors = validateForm(form, isEdit);

  const setEntry = (i: number, patch: Partial<{ key: string; value: string }>): void => setForm((p) => ({ ...p, entries: p.entries.map((e, idx) => (idx === i ? { ...e, ...patch, masked: 'value' in patch ? undefined : e.masked } : e)) }));

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
        {isEdit ? `Edit ${existing.name}` : 'Create config or secret'}
      </Typography>

      <Stack gap={3} sx={{ mb: 3, maxWidth: 520 }}>
        <TextField
          label="Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          disabled={isEdit}
          required
          error={showErrors && !isEdit && !!validateName(form.name)}
          helperText={showErrors && !isEdit ? validateName(form.name) : undefined}
          fullWidth
        />
        <Box>
          <Typography variant="subtitle2">Type</Typography>
          <RadioGroup row value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as ConfigKind }))}>
            <FormControlLabel value="config" control={<Radio />} label="Config (environment variables)" disabled={isEdit} />
            <FormControlLabel value="secret" control={<Radio />} label="Secret" disabled={isEdit} />
          </RadioGroup>
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2">Environment variables</Typography>
        <Button size="small" startIcon={<Upload size={14} />} onClick={() => setImporting((v) => !v)}>
          Import .env
        </Button>
      </Stack>
      {importing && (
        <Box sx={{ mb: 2 }}>
          <TextField label=".env contents" placeholder="API_BASE_URL=https://api.example.com" multiline minRows={4} value={envText} onChange={(e) => setEnvText(e.target.value)} fullWidth sx={{ mb: 1 }} />
          <Button size="small" variant="outlined" onClick={importEnv} disabled={envText.trim() === ''}>
            Add entries
          </Button>
        </Box>
      )}

      <Stack gap={1.5} sx={{ mb: 2 }}>
        {form.entries.map((entry, i) => {
          const keyError = showErrors ? validateKey(entry.key) : '';
          return (
            <Stack key={i} direction="row" gap={1.5} alignItems="flex-start">
              <TextField size="small" label="Key" value={entry.key} onChange={(e) => setEntry(i, { key: e.target.value })} error={!!keyError} helperText={keyError || undefined} sx={{ flex: 1 }} />
              <TextField
                size="small"
                label="Value"
                type={isSecret ? 'password' : 'text'}
                value={entry.value}
                placeholder={entry.masked ? '•••••••• (unchanged)' : undefined}
                autoComplete="off"
                onChange={(e) => setEntry(i, { value: e.target.value })}
                sx={{ flex: 2 }}
              />
              <IconButton aria-label={`Remove ${entry.key || 'entry'}`} color="error" onClick={() => setForm((p) => ({ ...p, entries: p.entries.filter((_, idx) => idx !== i) }))}>
                <Trash2 size={16} />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
      <Button size="small" startIcon={<Plus size={14} />} onClick={() => setForm((p) => ({ ...p, entries: [...p.entries, { key: '', value: '' }] }))}>
        Add key
      </Button>

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
