import type { JSX } from 'react';
import { Alert, Stack } from '@wso2/oxygen-ui';
import RangeInput from './RangeInput';
import { MAX_REPLICAS, MAX_TARGET_PENDING_REQUESTS } from './scalingConstants';
import type { ScaleToZeroSettings } from '../../types/scaling';

interface ScaleToZeroConfigProps {
  value: ScaleToZeroSettings;
  onChange: (value: ScaleToZeroSettings) => void;
}

export default function ScaleToZeroConfig({ value, onChange }: ScaleToZeroConfigProps): JSX.Element {
  return (
    <Stack gap={2.5}>
      <Alert severity="info">When no requests arrive, the web app scales down to zero replicas. The first request after that wakes it up, so it may load a little slower.</Alert>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <RangeInput label="Max replicas" value={value.maxReplicas} onChange={(maxReplicas) => onChange({ ...value, maxReplicas })} min={1} max={MAX_REPLICAS} />
        <RangeInput label="Pending requests that start a new replica" value={value.targetPendingRequests} onChange={(targetPendingRequests) => onChange({ ...value, targetPendingRequests })} min={1} max={MAX_TARGET_PENDING_REQUESTS} />
      </Stack>
    </Stack>
  );
}
