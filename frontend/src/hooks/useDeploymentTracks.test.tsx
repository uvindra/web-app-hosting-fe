import { act, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateDeploymentTrack, useDeleteDeploymentTrack } from './useDeploymentTracks';
import type { DeploymentTrack } from '../types/deploymentTracks';

const track = (id: string, branch: string): DeploymentTrack => ({ id, branch, isDefault: id === 'site', autoDeploy: false, deployed: false, createdAt: '' });
const main = track('site', 'main');
const b1 = track('site-b1', 'b1');

// The BFF list can lag behind a delete (OpenChoreo deletes asynchronously): the refetch still returns b1.
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), del: vi.fn() }));
vi.mock('../api/deploymentTracks', () => ({
  fetchDeploymentTracks: api.list,
  createDeploymentTrack: api.create,
  deleteDeploymentTrack: api.del,
  checkDeploymentTrackDeletable: vi.fn(),
  fetchRepoBranches: vi.fn(),
  updateAutoDeploy: vi.fn(),
}));

function setup<T>(useHook: () => T): { qc: QueryClient; hook: () => T } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let current: T | undefined;
  function Probe(): JSX.Element {
    current = useHook();
    return <span />;
  }
  act(() =>
    createRoot(document.createElement('div')).render(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  return {
    qc,
    hook: () => {
      if (current === undefined) throw new Error('hook not rendered');
      return current;
    },
  };
}

describe('deployment track mutations', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
  });

  it('removes a deleted track from the cached list without waiting for the refetch', async () => {
    api.del.mockResolvedValue(undefined);
    api.list.mockReturnValue(new Promise(() => {})); // the refetch never lands
    const { qc, hook } = setup(() => useDeleteDeploymentTrack('site'));
    qc.setQueryData(['deploymentTracks', 'site'], [main, b1]);
    await act(() => hook().mutateAsync('site-b1'));
    expect(qc.getQueryData(['deploymentTracks', 'site'])).toEqual([main]);
    expect(api.del).toHaveBeenCalledWith('site', 'site-b1');
  });

  it('adds a created track to the cached list', async () => {
    api.create.mockResolvedValue(b1);
    api.list.mockReturnValue(new Promise(() => {}));
    const { qc, hook } = setup(() => useCreateDeploymentTrack('site'));
    qc.setQueryData(['deploymentTracks', 'site'], [main]);
    await act(() => hook().mutateAsync({ branch: 'b1' }));
    expect(qc.getQueryData(['deploymentTracks', 'site'])).toEqual([main, b1]);
  });
});
