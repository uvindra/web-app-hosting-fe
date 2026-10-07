import type { JSX } from 'react';
import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import ProbeSliderGroup from './ProbeSliderGroup';
import { PROBE_TYPE, type Probe } from '../../types/healthChecks';
import { probeTypeLabel } from './probeFormState';

function Fact({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <Typography variant="body2">
      <Box component="span" fontWeight={700}>
        {label}:
      </Box>{' '}
      {value}
    </Typography>
  );
}

/** Read-only display of one probe: its mechanism details plus timing/threshold sliders. */
export default function ProbeDisplay({ probe, showSuccess }: { probe: Probe; showSuccess: boolean }): JSX.Element {
  const headers = probe.httpGet?.httpHeaders ?? [];
  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" flexWrap="wrap" gap={3}>
          <Fact label="Type" value={probeTypeLabel(probe.type)} />
          {probe.type === PROBE_TYPE.HTTP_GET && probe.httpGet && (
            <>
              <Fact label="Port" value={probe.httpGet.port} />
              <Fact label="Path" value={probe.httpGet.path} />
            </>
          )}
          {probe.type === PROBE_TYPE.TCP && probe.tcpSocket && <Fact label="Port" value={probe.tcpSocket.port} />}
        </Stack>
        {probe.type === PROBE_TYPE.EXEC && probe.exec && (
          <Box component="pre" sx={{ m: 0, mt: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'text.secondary', overflowX: 'auto' }}>
            {JSON.stringify(probe.exec.command)}
          </Box>
        )}
        {headers.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
            {headers.map((h) => (
              <Chip key={h.name + h.value} size="small" variant="outlined" color="secondary" label={`${h.name}: ${h.value}`} />
            ))}
          </Stack>
        )}
      </Box>
      <ProbeSliderGroup values={probe} showSuccess={showSuccess} viewMode />
    </Box>
  );
}
