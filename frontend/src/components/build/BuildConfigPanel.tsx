import type { JSX } from 'react';
import { Box, Typography } from '@wso2/oxygen-ui';
import { presetKind } from '../../constants/buildPresets';
import type { BuildConfig } from '../../types/build';

/** Common fields, then only the build fields the preset uses (see `presetKind`). */
const fields = (config: BuildConfig): Array<[string, string | undefined]> => {
  const common: Array<[string, string | undefined]> = [
    ['Build Preset', config.buildPreset],
    ['Repository', config.repoUrl],
    ['Branch', config.branch],
    ['Component Directory', config.componentDirectory],
  ];
  const port: [string, string] = ['Port', String(config.port)];
  switch (presetKind(config.buildPreset)) {
    case 'spa':
      return [...common, ['Build Command', config.buildCommand], ['Build Path (Output Directory)', config.buildPath], ['Node Version', config.nodeVersion], port];
    case 'static':
      return [...common, ['Directory to serve', config.buildPath], port];
    case 'docker':
      return [...common, ['Dockerfile (from repository root)', config.docker?.filePath], ['Build Context (from repository root)', config.docker?.context], port];
    default:
      return [...common, ['Node Version', config.nodeVersion], port];
  }
};

const MONO_FIELDS = new Set(['Build Command', 'Build Path (Output Directory)', 'Directory to serve', 'Dockerfile (from repository root)', 'Build Context (from repository root)']);

/** Read-only view of the build settings captured at web-app creation. */
export default function BuildConfigPanel({ config }: { config: BuildConfig }): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Build Configuration
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {fields(config)
          .filter((f): f is [string, string] => f[1] !== undefined && f[1] !== '')
          .map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: MONO_FIELDS.has(label) ? 'monospace' : undefined, wordBreak: 'break-all' }}>
                {value}
              </Typography>
            </Box>
          ))}
      </Box>
    </Box>
  );
}
