import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, fetchProject, createProject } from '../api/projects';
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
