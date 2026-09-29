import type { JSX } from 'react';
import { Box, LinearProgress, Typography } from '@wso2/oxygen-ui';

interface UsageBarProps {
  percent: number;
  label: string;
}

/** Progress bar with a right-hand percent label; turns warning/error as usage climbs. */
export default function UsageBar({ percent, label }: UsageBarProps): JSX.Element {
  const color = percent >= 90 ? 'error' : percent >= 75 ? 'warning' : 'primary';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 140 }}>
      <LinearProgress variant="determinate" value={percent} color={color} aria-label={label} sx={{ flex: 1, height: 6, borderRadius: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ width: 36, textAlign: 'right' }}>
        {percent}%
      </Typography>
    </Box>
  );
}
