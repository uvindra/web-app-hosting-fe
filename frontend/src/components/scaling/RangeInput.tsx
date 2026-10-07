import type { JSX } from 'react';
import { Box, IconButton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Minus, Plus } from '@wso2/oxygen-ui-icons-react';

interface RangeInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

/** A numeric field flanked by -/+ steppers. */
export default function RangeInput({ label, value, onChange, min, max }: RangeInputProps): JSX.Element {
  const set = (v: number): void => onChange(Math.min(max, Math.max(min, v)));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, width: 'fit-content' }}>
        <IconButton size="small" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => set(value - 1)} sx={{ borderRadius: 0 }}>
          <Minus size={16} />
        </IconButton>
        <TextField
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) set(n);
          }}
          size="small"
          slotProps={{ htmlInput: { inputMode: 'numeric', style: { textAlign: 'center', width: 56 }, 'aria-label': label } }}
          sx={{ '& fieldset': { border: 'none' } }}
        />
        <IconButton size="small" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => set(value + 1)} sx={{ borderRadius: 0 }}>
          <Plus size={16} />
        </IconButton>
      </Stack>
    </Box>
  );
}
