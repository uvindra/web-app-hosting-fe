import type { JSX } from 'react';
import { Alert, Box, Button, Skeleton, Stack, Typography, useTheme } from '@wso2/oxygen-ui';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import type { MetricsDatum } from '../../types/metrics';

/** Theme palette keys usable as series colors; resolved at render so charts follow light/dark mode. */
export type SeriesColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export interface MetricSeries {
  key: string;
  name: string;
  color: SeriesColor;
  /** Dash limit/request reference lines so they read without relying on color alone. */
  dashed?: boolean;
}

interface MetricGraphProps {
  title: string;
  /** Unit shown in the card subtitle, e.g. "MB", "req/s". */
  unit: string;
  rows: MetricsDatum[] | undefined;
  series: MetricSeries[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const CHART_HEIGHT = 260;

/** One metrics chart card: a multi-series line chart with loading, error and empty states. */
export default function MetricGraph({ title, unit, rows, series, isLoading, isError, onRetry }: MetricGraphProps): JSX.Element {
  const theme = useTheme();
  const colors = series.map((s) => theme.palette[s.color].main);

  const renderBody = (): JSX.Element => {
    if (isLoading) return <Skeleton variant="rounded" height={CHART_HEIGHT} />;
    if (isError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          }>
          Failed to load metrics.
        </Alert>
      );
    }
    if (!rows || rows.length === 0) return <Alert severity="info">No data in the selected time range.</Alert>;
    return (
      <Box sx={{ '& .recharts-cartesian-grid line': { opacity: 0.3 } }}>
        <LineChart
          data={rows}
          xAxisDataKey="label"
          height={CHART_HEIGHT}
          colors={colors}
          lines={series.map((s, i) => ({ dataKey: s.key, name: s.name, stroke: colors[i], strokeDasharray: s.dashed ? '5 4' : undefined, type: 'monotone' as const, dot: false }))}
          legend={{ show: true, verticalAlign: 'top' }}
          margin={{ top: 16 }}
          tooltip={{ show: true }}
          grid={{ show: true }}
        />
      </Box>
    );
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
      <Stack sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Values in {unit}
        </Typography>
      </Stack>
      {renderBody()}
    </Box>
  );
}
