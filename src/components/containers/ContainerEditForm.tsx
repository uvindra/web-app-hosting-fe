import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, Radio, RadioGroup, Slider, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useUpdateContainer } from '../../hooks/useContainers';
import { CPU_MAX, CPU_MIN, CPU_STEP, MEMORY_MAX, MEMORY_MIN, MEMORY_STEP, containerToForm, formToUpdate, isFormDirty, splitLines, validateForm } from './containerForm';
import type { ImagePullPolicy, WebAppContainer } from '../../types/containers';
import type { EnvironmentId } from '../../types/webApp';

interface ContainerEditFormProps {
  container: WebAppContainer;
  webAppId: string;
  environment: EnvironmentId;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

interface RangeProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  request: number;
  limit: number;
  onChange: (request: number, limit: number) => void;
}

/** Two-thumb slider: lower thumb = request, upper thumb = limit. */
function RangeSlider({ label, unit, min, max, step, request, limit, onChange }: RangeProps): JSX.Element {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {request} {unit} / {limit} {unit}
        </Typography>
      </Stack>
      <Box sx={{ px: 1 }}>
        <Slider
          value={[request, limit]}
          min={min}
          max={max}
          step={step}
          disableSwap
          valueLabelDisplay="auto"
          getAriaLabel={(i) => (i === 0 ? `${label} request` : `${label} limit`)}
          onChange={(_e, v) => {
            if (Array.isArray(v)) onChange(v[0], v[1]);
          }}
        />
      </Box>
    </Box>
  );
}

export default function ContainerEditForm({ container, webAppId, environment, onClose, onSaved, onError }: ContainerEditFormProps): JSX.Element {
  const [form, setForm] = useState(() => containerToForm(container));
  const update = useUpdateContainer(webAppId, environment);
  const errors = validateForm(form);
  const dirty = isFormDirty(form, container);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (): void => {
    update.mutate(
      { containerId: container.id, update: formToUpdate(form) },
      {
        onSuccess: () => onSaved('Container updated.'),
        onError: (e) => onError(e instanceof Error ? e.message : 'Failed to update the container.'),
      },
    );
  };

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onClose} sx={{ px: 0, mb: 3 }}>
        Go Back
      </Button>
      <Typography variant="h6" sx={{ mb: 3 }}>
        Edit {container.name}
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} gap={4} sx={{ mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <RangeSlider label="CPU request / limit" unit="m" min={CPU_MIN} max={CPU_MAX} step={CPU_STEP} request={form.cpuRequest} limit={form.cpuLimit} onChange={(r, l) => setForm((p) => ({ ...p, cpuRequest: r, cpuLimit: l }))} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <RangeSlider label="Memory request / limit" unit="Mi" min={MEMORY_MIN} max={MEMORY_MAX} step={MEMORY_STEP} request={form.memoryRequest} limit={form.memoryLimit} onChange={(r, l) => setForm((p) => ({ ...p, memoryRequest: r, memoryLimit: l }))} />
        </Box>
      </Stack>

      <Typography variant="subtitle2">Image pull policy</Typography>
      <RadioGroup row value={form.imagePullPolicy} onChange={(e) => set('imagePullPolicy', e.target.value as ImagePullPolicy)} sx={{ mb: 3 }}>
        <FormControlLabel value="Always" control={<Radio />} label="Always" />
        <FormControlLabel value="IfNotPresent" control={<Radio />} label="If Not Present" />
      </RadioGroup>

      <Stack gap={2} sx={{ mb: 2 }}>
        <TextField label="Command" helperText="One entry per line" multiline minRows={2} value={form.command} onChange={(e) => set('command', e.target.value)} fullWidth />
        <TextField label="Arguments" helperText="One entry per line" multiline minRows={2} value={form.args} onChange={(e) => set('args', e.target.value)} fullWidth />
      </Stack>
      {splitLines(form.command).length + splitLines(form.args).length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          With no command or arguments, the image&apos;s default entrypoint is used.
        </Alert>
      )}
      {errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errors[0]}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={update.isPending || !dirty || errors.length > 0} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Save Changes
        </Button>
      </Stack>
    </Box>
  );
}
