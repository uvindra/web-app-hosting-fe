import type { JSX } from 'react';
import { MenuItem, Select } from '@wso2/oxygen-ui';
import type { Environment } from '../../types/environment';
import type { EnvironmentId } from '../../types/webApp';

interface EnvironmentSelectProps {
  environments: readonly Environment[];
  value: EnvironmentId;
  onChange: (env: EnvironmentId) => void;
}

/** Picker over the project's pipeline environments (in promotion order). */
export default function EnvironmentSelect({ environments, value, onChange }: EnvironmentSelectProps): JSX.Element {
  return (
    <Select size="small" value={environments.some((e) => e.id === value) ? value : ''} onChange={(e) => onChange(e.target.value as EnvironmentId)} sx={{ minWidth: 180 }} inputProps={{ 'aria-label': 'Environment' }}>
      {environments.map((e) => (
        <MenuItem key={e.id} value={e.id}>
          {e.name}
        </MenuItem>
      ))}
    </Select>
  );
}
