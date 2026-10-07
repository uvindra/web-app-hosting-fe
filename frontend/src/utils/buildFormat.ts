import type { BuildRun, BuildRunStatus } from '../types/build';
import type { PaletteColor } from './statusColor';

const LABELS: Record<BuildRunStatus, string> = {
  success: 'Success',
  failed: 'Failed',
  'in-progress': 'In Progress',
};

const COLORS: Record<BuildRunStatus, PaletteColor> = {
  success: 'success',
  failed: 'error',
  'in-progress': 'warning',
};

export const getBuildStatusLabel = (status: BuildRunStatus): string => LABELS[status];
export const getBuildStatusColor = (status: BuildRunStatus): PaletteColor => COLORS[status];

/** "1m 05s" style duration; '' while the build has not completed. */
export function formatBuildDuration(run: Pick<BuildRun, 'triggeredAt' | 'completedAt'>): string {
  if (!run.completedAt) return '';
  const secs = Math.round((new Date(run.completedAt).getTime() - new Date(run.triggeredAt).getTime()) / 1000);
  if (Number.isNaN(secs) || secs < 0) return '';
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return m > 0 ? `${m}m ${s}s` : `${secs}s`;
}
