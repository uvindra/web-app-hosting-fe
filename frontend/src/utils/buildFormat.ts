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

/** Workflow step name of the image vulnerability scan (BFF `platformres.ScanStepName`). */
export const SECURITY_SCAN_STEP = 'security-scan';

const STEP_TITLES: Record<string, string> = {
  'checkout-source': 'Checkout source',
  'generate-spa-files': 'Prepare web server',
  'build-image': 'Build image',
  [SECURITY_SCAN_STEP]: 'Security scan',
  'publish-image': 'Publish image',
  'generate-workload-cr': 'Generate workload',
};

/** Human title of a build step; unknown steps keep their name. */
export const getBuildStepTitle = (name: string): string => STEP_TITLES[name] ?? name;

/** True when the build failed its security scan (critical vulnerabilities or a scanner error). */
export const failedSecurityScan = (run: Pick<BuildRun, 'steps'>): boolean =>
  run.steps.some((s) => s.name === SECURITY_SCAN_STEP && s.status === 'failed');

export interface Vulnerability {
  id: string;
  library: string;
  installed: string;
  fixed: string;
  title: string;
}

/**
 * Critical vulnerabilities from the security-scan step logs (Trivy's table
 * output: │ Library │ Vulnerability │ Severity │ Status │ Installed │ Fixed │ Title │).
 * Wrapped continuation rows and blank library cells (same library as the row
 * above) are folded in; duplicates are dropped.
 */
export function parseScanFindings(logs: readonly string[]): Vulnerability[] {
  const out: Vulnerability[] = [];
  let library = '';
  for (const line of logs) {
    if (!line.includes('│')) continue;
    const cells = line.split('│').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const [lib, id, severity, , installed, fixed, title] = cells;
    if (lib) library = lib;
    if (severity !== 'CRITICAL' || !id) continue;
    if (out.some((v) => v.id === id && v.library === library)) continue;
    out.push({ id, library, installed, fixed, title });
  }
  return out;
}
