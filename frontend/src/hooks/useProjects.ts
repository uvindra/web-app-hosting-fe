import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, fetchProject, createProject, fetchProjectEnvironments } from '../api/projects';
import type { CreateProjectInput } from '../types/project';

export function useProjects(orgHandle: string) {
  return useQuery({
    queryKey: ['projects', orgHandle],
    queryFn: () => fetchProjects(orgHandle),
    enabled: !!orgHandle,
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId,
  });
}

export function useProjectByHandler(orgHandle: string, handler: string) {
  const { data: projects = [], isLoading } = useProjects(orgHandle);
  const data = handler ? (projects.find((p) => p.handler === handler) ?? undefined) : undefined;
  return { data, isLoading: !data && isLoading && !!handler };
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** The project's deployment-pipeline environments, in promotion order. */
/** A project's pipeline environments (`undefined`: the project isn't known yet, nothing is fetched). */
export function useProjectEnvironments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projectEnvironments', projectId],
    queryFn: projectId ? () => fetchProjectEnvironments(projectId) : skipToken,
    staleTime: 5 * 60 * 1000,
  });
}
