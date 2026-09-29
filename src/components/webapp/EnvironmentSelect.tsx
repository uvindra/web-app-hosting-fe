import type { JSX } from 'react';
import { MenuItem, Select } from '@wso2/oxygen-ui';
import { ENVIRONMENT_LABEL, ENVIRONMENT_IDS } from '../../constants/environments';
import type { EnvironmentId } from '../../types/webApp';

interface EnvironmentSelectProps {
  value: EnvironmentId;
  onChange: (env: EnvironmentId) => void;
}

export default function EnvironmentSelect({ value, onChange }: EnvironmentSelectProps): JSX.Element {
  return (
    <Select size="small" value={value} onChange={(e) => onChange(e.target.value as EnvironmentId)} sx={{ minWidth: 180 }} inputProps={{ 'aria-label': 'Environment' }}>
      {ENVIRONMENT_IDS.map((id) => (
        <MenuItem key={id} value={id}>
          {ENVIRONMENT_LABEL[id]}
        </MenuItem>
      ))}
    </Select>
  );
}
