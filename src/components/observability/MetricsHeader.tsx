import type { JSX } from 'react';
import { IconButton, MenuItem, Stack, TextField, Tooltip } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { METRICS_RANGES, METRICS_REFRESH_INTERVALS, type MetricsRange } from '../../types/metrics';

interface MetricsHeaderProps {
  range: MetricsRange;
  onRangeChange: (range: MetricsRange) => void;
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/** Controls row for the Metrics page: time range, auto-refresh interval and manual refresh. */
export default function MetricsHeader({ range, onRangeChange, refreshSeconds, onRefreshSecondsChange, onRefresh, isRefreshing }: MetricsHeaderProps): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
      <TextField select size="small" value={range} onChange={(e) => onRangeChange(e.target.value as MetricsRange)} sx={{ minWidth: 180 }} slotProps={{ htmlInput: { 'aria-label': 'Time range' } }}>
        {METRICS_RANGES.map((r) => (
          <MenuItem key={r.value} value={r.value}>
            {r.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label="Auto-refresh" value={refreshSeconds} onChange={(e) => onRefreshSecondsChange(Number(e.target.value))} sx={{ minWidth: 140 }}>
        {METRICS_REFRESH_INTERVALS.map((i) => (
          <MenuItem key={i.value} value={i.value}>
            {i.label}
          </MenuItem>
        ))}
      </TextField>
      <Tooltip title="Refresh">
        <span>
          <IconButton size="small" aria-label="Refresh metrics" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw size={16} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
