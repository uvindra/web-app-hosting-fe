import { useState, type JSX } from 'react';
import { Box, Button, CircularProgress, Divider, FormControlLabel, IconButton, Radio, RadioGroup, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Plus, X } from '@wso2/oxygen-ui-icons-react';
import ProbeSliderGroup, { type ProbeSliderValues } from './ProbeSliderGroup';
import { PROBE_KIND, PROBE_TYPE, type Probe, type ProbeKind, type ProbeType } from '../../types/healthChecks';
import { REQUIRED_ERROR, defaultProbeForm, formToProbe, isProbeFormValid, probeToForm, validatePath, validatePort, type ProbeFormState } from './probeFormState';

interface ProbeFormProps {
  kind: ProbeKind;
  /** The probe being edited; undefined when creating. */
  existing?: Probe;
  isSaving: boolean;
  onSubmit: (probe: Probe) => void;
  onClose: () => void;
  /** The web app's port (prefilled for HTTP/TCP probes; the BFF only accepts it). */
  defaultPort?: number;
}

const TYPE_DESCRIPTION: Record<ProbeType, string> = {
  httpGet: 'The probe sends an HTTP GET request to the container on the given port and path. Status codes from 200 to 399 count as success.',
  tcp: 'The probe tries to open a socket to the container on the given port. Failing to connect counts as a failure.',
  exec: 'The probe runs the given command inside the container. A non-zero exit code counts as a failure.',
};

const reqSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } } as const;

export default function ProbeForm({ kind, existing, isSaving, onSubmit, onClose, defaultPort }: ProbeFormProps): JSX.Element {
  const isLiveness = kind === PROBE_KIND.LIVENESS;
  const [form, setForm] = useState<ProbeFormState>(() => (existing ? probeToForm(existing) : defaultProbeForm(defaultPort)));
  // Errors only surface once a field has been touched.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const patch = (p: Partial<ProbeFormState>): void => setForm((prev) => ({ ...prev, ...p }));
  const touch = (key: string) => (): void => setTouched((prev) => ({ ...prev, [key]: true }));
  const shown = (key: string, err: string | undefined): string | undefined => (touched[key] ? err : undefined);

  const portError = shown('port', validatePort(form.port));
  const pathError = shown('path', validatePath(form.path));

  const portField = (
    <TextField
      label="Port"
      required
      size="small"
      value={form.port}
      onChange={(e) => patch({ port: e.target.value })}
      onBlur={touch('port')}
      slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      sx={{ width: 120, ...reqSx }}
      error={!!portError}
      helperText={portError ?? ' '}
    />
  );

  const setHeader = (index: number, field: 'name' | 'value', value: string): void => patch({ httpHeaders: form.httpHeaders.map((h, i) => (i === index ? { ...h, [field]: value } : h)) });
  const setCommand = (index: number, value: string): void => patch({ command: form.command.map((c, i) => (i === index ? value : c)) });

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onClose} sx={{ px: 0, mb: 3 }}>
        Go back to Health Checks
      </Button>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        {existing ? 'Edit' : 'Configure'} {kind} Probe
      </Typography>

      <ProbeSliderGroup values={form} showSuccess={!isLiveness} onChange={(field: keyof ProbeSliderValues, value) => patch({ [field]: value })} />

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Select {kind.toLowerCase()} probe type
      </Typography>
      <RadioGroup row value={form.type} onChange={(e) => patch({ type: e.target.value as ProbeType })} sx={{ mb: 2 }}>
        <FormControlLabel value={PROBE_TYPE.HTTP_GET} control={<Radio />} label="HTTP GET Request" />
        <FormControlLabel value={PROBE_TYPE.TCP} control={<Radio />} label="TCP Probe" />
        <FormControlLabel value={PROBE_TYPE.EXEC} control={<Radio />} label="Execute a Command" />
      </RadioGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {TYPE_DESCRIPTION[form.type]}
      </Typography>

      {form.type === PROBE_TYPE.HTTP_GET && (
        <>
          <Stack direction="row" gap={2} sx={{ mb: 2 }}>
            {portField}
            <TextField label="Path" required size="small" placeholder="e.g. /healthz" value={form.path} onChange={(e) => patch({ path: e.target.value })} onBlur={touch('path')} sx={{ flex: 1, ...reqSx }} error={!!pathError} helperText={pathError ?? ' '} />
          </Stack>
          <Stack gap={1.5} sx={{ mb: 1.5 }}>
            {form.httpHeaders.map((h, i) => {
              const keyError = shown(`hk${i}`, h.name.trim() === '' ? REQUIRED_ERROR : undefined);
              const valueError = shown(`hv${i}`, h.value.trim() === '' ? REQUIRED_ERROR : undefined);
              return (
                <Stack key={i} direction="row" gap={1.5} alignItems="flex-start">
                  <TextField label="Header key" required size="small" value={h.name} onChange={(e) => setHeader(i, 'name', e.target.value)} onBlur={touch(`hk${i}`)} sx={{ flex: 1, ...reqSx }} error={!!keyError} helperText={keyError ?? ' '} />
                  <TextField label="Header value" required size="small" value={h.value} onChange={(e) => setHeader(i, 'value', e.target.value)} onBlur={touch(`hv${i}`)} sx={{ flex: 1, ...reqSx }} error={!!valueError} helperText={valueError ?? ' '} />
                  <IconButton aria-label={`Remove header ${i + 1}`} sx={{ mt: 0.5 }} onClick={() => patch({ httpHeaders: form.httpHeaders.filter((_, j) => j !== i) })}>
                    <X size={16} />
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
          <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => patch({ httpHeaders: [...form.httpHeaders, { name: '', value: '' }] })}>
            Add HTTP header
          </Button>
        </>
      )}

      {form.type === PROBE_TYPE.TCP && portField}

      {form.type === PROBE_TYPE.EXEC && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontFamily: 'monospace' }}>
            e.g. [&quot;cat&quot;, &quot;/tmp/healthy&quot;]
          </Typography>
          <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5}>
            {form.command.map((c, i) => (
              <TextField
                key={i}
                size="small"
                value={c}
                onChange={(e) => setCommand(i, e.target.value)}
                sx={{ width: 200 }}
                slotProps={{ htmlInput: { 'aria-label': `Command ${i + 1}` } }}
                InputProps={{
                  endAdornment: (
                    <IconButton size="small" edge="end" aria-label={`Remove command ${i + 1}`} onClick={() => patch({ command: form.command.filter((_, j) => j !== i) })}>
                      <X size={14} />
                    </IconButton>
                  ),
                }}
              />
            ))}
            <Button variant="outlined" size="small" startIcon={<Plus size={16} />} onClick={() => patch({ command: [...form.command, ''] })}>
              Add command
            </Button>
          </Stack>
        </Box>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSubmit(formToProbe(form))} disabled={isSaving || !isProbeFormValid(form)} startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Save
        </Button>
      </Stack>
    </Box>
  );
}
