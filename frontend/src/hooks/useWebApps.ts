import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWebApps, fetchWebApp, createWebApp, deleteWebApp } from '../api/webApps';
import type { CreateWebAppInput, WebApp } from '../types/webApp';
import type { Sample } from '../types/sample';
import { createFromSample } from '../utils/sampleInput';

/** A project's web apps (`undefined`: the project isn't known yet, nothing is fetched). */
export function useWebApps(projectId: string | undefined) {
  return useQuery({
    queryKey: ['webApps', projectId],
    queryFn: projectId ? () => fetchWebApps(projectId) : skipToken,
  });
}

export function useWebApp(projectId: string, webAppId: string) {
  return useQuery({
    queryKey: ['webApp', projectId, webAppId],
    queryFn: () => fetchWebApp(projectId, webAppId),
    enabled: !!projectId && !!webAppId,
  });
}

export function useWebAppByHandler(projectId: string | undefined, handler: string) {
  const { data: webApps = [], isLoading } = useWebApps(projectId);
  const data = handler ? (webApps.find((a) => a.handler === handler) ?? undefined) : undefined;
  return { data, isLoading: !data && isLoading && !!handler };
}

export function useCreateWebApp(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebAppInput) => createWebApp(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webApps', projectId] }),
  });
}

/** Creates a web app from a sample (as a public-Git create); a name collision gets a suffixed handle — use the returned one. */
export function useCreateSampleWebApp(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sample: Sample) => createFromSample(sample, (input) => createWebApp(projectId, input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webApps', projectId] }),
  });
}

export function useDeleteWebApp(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (webAppId: string) => deleteWebApp(projectId, webAppId),
    onSuccess: (_, webAppId) => {
      // OpenChoreo deletes asynchronously (the BFF hides Components being deleted): drop the web app now.
      qc.setQueryData<WebApp[]>(['webApps', projectId], (apps) => apps?.filter((a) => a.id !== webAppId));
      qc.removeQueries({ queryKey: ['webApp', projectId, webAppId] });
      qc.removeQueries({ queryKey: ['deploymentTracks', webAppId] });
      void qc.invalidateQueries({ queryKey: ['webApps', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
