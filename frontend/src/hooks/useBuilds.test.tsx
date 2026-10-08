import { act, type JSX } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_LOG_SETTLE_MS, BUILD_LOG_SETTLE_WINDOW_MS, BUILD_POLL_RUNNING_MS, buildLogsInterval, useBuildLogs } from './useBuilds';
import type { BuildRun } from '../types/build';

const api = vi.hoisted(() => ({ logs: vi.fn() }));
vi.mock('../api/builds', () => ({
  fetchBuildLogs: api.logs,
  fetchBuildConfig: vi.fn(),
  fetchBuildRuns: vi.fn(),
  fetchBuilds: vi.fn(),
  fetchEnvironments: vi.fn(),
  fetchLatestCommit: vi.fn(),
  triggerBuild: vi.fn(),
}));

const track = { webAppId: 'site', trackId: 'site' };
const run = (status: BuildRun['status'], completedAt?: string): BuildRun => ({ id: 'r1', status, commitSha: 'abc', commitMessage: '', author: '', branch: 'main', triggeredAt: '', completedAt, steps: [] });

describe('useBuildLogs', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
  });

  it('refetches the logs as soon as the open build finishes', async () => {
    api.logs.mockImplementation(() => Promise.resolve({ ...run('in-progress'), steps: [] }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Probe({ r }: { r: BuildRun | undefined }): JSX.Element {
      useBuildLogs(track, r);
      return <span />;
    }
    let root: Root | undefined;
    const render = async (r: BuildRun | undefined) =>
      act(async () => {
        root ??= createRoot(document.createElement('div'));
        root.render(
          <QueryClientProvider client={qc}>
            <Probe r={r} />
          </QueryClientProvider>,
        );
      });

    await render(undefined);
    expect(api.logs).not.toHaveBeenCalled(); // nothing open: no request
    await render(run('in-progress'));
    expect(api.logs).toHaveBeenCalledTimes(1);
    await render(run('success', new Date().toISOString()));
    expect(api.logs).toHaveBeenCalledTimes(2);
    expect(api.logs).toHaveBeenLastCalledWith(track, 'r1');
    act(() => root?.unmount());
  });

  it('polls while running and settles briefly after completion', () => {
    const now = Date.parse('2026-10-08T10:00:00Z');
    expect(buildLogsInterval(run('in-progress'), now)).toBe(BUILD_POLL_RUNNING_MS);
    expect(buildLogsInterval(run('success', '2026-10-08T09:59:50Z'), now)).toBe(BUILD_LOG_SETTLE_MS);
    expect(buildLogsInterval(run('failed', new Date(now - BUILD_LOG_SETTLE_WINDOW_MS - 1).toISOString()), now)).toBe(false);
    expect(buildLogsInterval(run('success'), now)).toBe(false);
  });
});
