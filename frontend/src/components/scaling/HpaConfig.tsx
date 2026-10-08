import type { JSX } from 'react';
import { Box, FormControlLabel, Paper, Slider, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import RangeInput from './RangeInput';
import { CPU_THRESHOLD, MAX_REPLICAS, MEMORY_THRESHOLD } from './scalingConstants';
import type { HpaSettings } from '../../types/scaling';

interface HpaConfigProps {
  value: HpaSettings;
  onChange: (value: HpaSettings) => void;
  /** Caps on min / max replicas (the plan's, relative to the saved settings); default MAX_REPLICAS. */
  minReplicasCap?: number;
  maxReplicasCap?: number;
}

interface ThresholdSliderProps {
  label: string;
  /** undefined means the metric is disabled. */
  value: number | undefined;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number | undefined) => void;
}

function ThresholdSlider({ label, value, min, max, defaultValue, onChange }: ThresholdSliderProps): JSX.Element {
  const enabled = value !== undefined;
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 260 }}>
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => onChange(e.target.checked ? defaultValue : undefined)} />} label={label} />
      <Box sx={{ px: 1, mt: 1, opacity: enabled ? 1 : 0.5 }}>
        <Slider value={value ?? defaultValue} min={min} max={max} onChange={(_e, v) => onChange(v as number)} disabled={!enabled} valueLabelDisplay="auto" aria-label={label} />
        <Typography variant="caption" color="text.secondary">
          {enabled ? `${value}% utilization` : 'Disabled'}
        </Typography>
      </Box>
    </Paper>
  );
}

export default function HpaConfig({ value, onChange, minReplicasCap = MAX_REPLICAS, maxReplicasCap = MAX_REPLICAS }: HpaConfigProps): JSX.Element {
  return (
    <Stack gap={2.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <RangeInput label="Min replicas" value={value.minReplicas} onChange={(minReplicas) => onChange({ ...value, minReplicas, maxReplicas: Math.max(value.maxReplicas, minReplicas) })} min={1} max={Math.min(minReplicasCap, maxReplicasCap)} />
        <RangeInput label="Max replicas" value={value.maxReplicas} onChange={(maxReplicas) => onChange({ ...value, maxReplicas, minReplicas: Math.min(value.minReplicas, maxReplicas) })} min={1} max={maxReplicasCap} />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <ThresholdSlider label="CPU threshold" value={value.cpuUtilization} min={CPU_THRESHOLD.min} max={CPU_THRESHOLD.max} defaultValue={CPU_THRESHOLD.default} onChange={(cpuUtilization) => onChange({ ...value, cpuUtilization })} />
        <ThresholdSlider label="Memory threshold" value={value.memoryUtilization} min={MEMORY_THRESHOLD.min} max={MEMORY_THRESHOLD.max} defaultValue={MEMORY_THRESHOLD.default} onChange={(memoryUtilization) => onChange({ ...value, memoryUtilization })} />
      </Stack>
    </Stack>
  );
}
