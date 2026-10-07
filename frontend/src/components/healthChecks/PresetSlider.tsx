import type { JSX } from 'react';
import { Box, Slider, Stack, Typography } from '@wso2/oxygen-ui';

interface PresetSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Allowed stops; the slider snaps to these. */
  marks: number[];
  unit?: string;
  onChange?: (value: number) => void;
  viewMode?: boolean;
  description?: string;
}

/** A slider that snaps to preset marks, with a `value/max unit` readout. Read-only in view mode. */
export default function PresetSlider({ label, value, min, max, marks, unit = '', onChange, viewMode, description }: PresetSliderProps): JSX.Element {
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {value}/{max}
          {unit ? ` ${unit}` : ''}
        </Typography>
      </Stack>
      <Box sx={{ px: 1 }}>
        <Slider value={value} min={min} max={max} step={null} marks={marks.map((v) => ({ value: v }))} disabled={viewMode} onChange={(_e, v) => onChange?.(v as number)} valueLabelDisplay={viewMode ? 'off' : 'auto'} aria-label={label} />
      </Box>
      {description && !viewMode && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {description}
        </Typography>
      )}
    </Box>
  );
}
