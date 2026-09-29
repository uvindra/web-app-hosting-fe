import type { JSX } from 'react';
import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import UsageBar from './UsageBar';
import { aggregateUsage, formatBytes, formatMillicores } from '../../utils/podMetrics';
import type { Pod } from '../../types/runtime';

const cardSx = { flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 } as const;

export default function ResourceUsageCards({ pods }: { pods: Pod[] }): JSX.Element {
  const { cpu, memory } = aggregateUsage(pods);
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 3 }}>
      <Box sx={cardSx}>
        <Typography variant="subtitle2" color="text.secondary">
          CPU usage
        </Typography>
        <Typography variant="h5" sx={{ my: 1 }}>
          {formatMillicores(cpu.used)}{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            of {formatMillicores(cpu.limit)}
          </Typography>
        </Typography>
        <UsageBar percent={cpu.percent} label="CPU usage" />
      </Box>
      <Box sx={cardSx}>
        <Typography variant="subtitle2" color="text.secondary">
          Memory usage
        </Typography>
        <Typography variant="h5" sx={{ my: 1 }}>
          {formatBytes(memory.used)}{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            of {formatBytes(memory.limit)}
          </Typography>
        </Typography>
        <UsageBar percent={memory.percent} label="Memory usage" />
      </Box>
    </Stack>
  );
}
