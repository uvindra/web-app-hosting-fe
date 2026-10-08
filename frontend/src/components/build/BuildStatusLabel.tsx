import type { JSX } from 'react';
import { Chip } from '@wso2/oxygen-ui';
import type { BuildRunStatus } from '../../types/build';
import { getBuildStatusColor, getBuildStatusLabel } from '../../utils/buildFormat';

export default function BuildStatusLabel({ status }: { status: BuildRunStatus }): JSX.Element {
  return <Chip size="small" label={getBuildStatusLabel(status)} color={getBuildStatusColor(status)} />;
}
