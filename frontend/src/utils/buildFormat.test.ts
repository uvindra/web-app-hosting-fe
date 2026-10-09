import { describe, expect, it } from 'vitest';
import { failedSecurityScan, formatBuildDuration, getBuildStatusColor, getBuildStatusLabel, getBuildStepTitle, parseScanFindings } from './buildFormat';

describe('buildFormat', () => {
  it('formats duration', () => {
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:05Z' })).toBe('1m 05s');
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:42Z' })).toBe('42s');
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z' })).toBe('');
  });
  it('maps status', () => {
    expect(getBuildStatusLabel('in-progress')).toBe('In Progress');
    expect(getBuildStatusColor('failed')).toBe('error');
  });
});

describe('security scan', () => {
  const logs = [
    '>> Scanning the image for CRITICAL vulnerabilities',
    '│ /mnt/vol/app-image.tar (alpine 3.10.9) │ alpine │        1        │',
    '│  Library  │ Vulnerability  │ Severity │ Status │ Installed Version │ Fixed Version │ Title │',
    '│ apk-tools │ CVE-2021-36159 │ CRITICAL │ fixed  │ 2.10.6-r0         │ 2.10.7-r0     │ libfetch: an out of boundary read │',
    '│           │                │          │        │                   │               │ to parse...                       │',
    '│           │ CVE-2021-30139 │ CRITICAL │ fixed  │ 2.10.6-r0         │ 2.10.6-r1     │ apk-tools: heap overflow          │',
    '│ zlib      │ CVE-2022-37434 │ CRITICAL │ fixed  │ 1.2.11-r1         │ 1.2.11-r2     │ zlib: heap overflow               │',
  ];
  it('parses critical findings from the Trivy table', () => {
    expect(parseScanFindings(logs)).toEqual([
      { id: 'CVE-2021-36159', library: 'apk-tools', installed: '2.10.6-r0', fixed: '2.10.7-r0', title: 'libfetch: an out of boundary read' },
      { id: 'CVE-2021-30139', library: 'apk-tools', installed: '2.10.6-r0', fixed: '2.10.6-r1', title: 'apk-tools: heap overflow' },
      { id: 'CVE-2022-37434', library: 'zlib', installed: '1.2.11-r1', fixed: '1.2.11-r2', title: 'zlib: heap overflow' },
    ]);
    expect(parseScanFindings(['>> Security scan passed'])).toEqual([]);
  });
  it('titles steps and detects a failed scan', () => {
    expect(getBuildStepTitle('security-scan')).toBe('Security scan');
    expect(getBuildStepTitle('custom')).toBe('custom');
    expect(failedSecurityScan({ steps: [{ name: 'security-scan', status: 'failed', logs: [] }] })).toBe(true);
    expect(failedSecurityScan({ steps: [{ name: 'build-image', status: 'failed', logs: [] }] })).toBe(false);
  });
});
