import type { JSX } from 'react';
import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import UsageBar from './UsageBar';
import { aggregateUsage, formatAllocation, formatBytes, formatMillicores } from '../../utils/podMetrics';
import type { Pod, UsageSummary } from '../../types/runtime';

const cardSx = { flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 } as const;

interface UsageCardProps {
  title: string;
  summary: UsageSummary;
  format: (n: number) => string;
  podCount: number;
}

/**
 * One resource card. Usage metrics arrive in P1: until the BFF reports usage, the card shows the configured
 * request/limit instead of a fake 0.
 */
function UsageCard({ title, summary, format, podCount }: UsageCardProps): JSX.Element {
  const scopeNote = podCount > 1 ? ` · total across ${podCount} pods` : '';
  if (summary.used === undefined || summary.percent === undefined) {
    return (
      <Box sx={cardSx}>
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h6" sx={{ my: 1 }}>
          {formatAllocation(summary.request, summary.limit, format)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Usage metrics coming soon{scopeNote}
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={cardSx}>
      <Typography variant="subtitle2" color="text.secondary">
        {title} usage
      </Typography>
      <Typography variant="h5" sx={{ my: 1 }}>
        {format(summary.used)}{' '}
        <Typography component="span" variant="body2" color="text.secondary">
          of {format(summary.limit)}
        </Typography>
      </Typography>
      <UsageBar percent={summary.percent} label={`${title} usage`} />
    </Box>
  );
}

export default function ResourceUsageCards({ pods }: { pods: Pod[] }): JSX.Element {
  const { cpu, memory } = aggregateUsage(pods);
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 3 }}>
      <UsageCard title="CPU" summary={cpu} format={formatMillicores} podCount={pods.length} />
      <UsageCard title="Memory" summary={memory} format={formatBytes} podCount={pods.length} />
    </Stack>
  );
}
