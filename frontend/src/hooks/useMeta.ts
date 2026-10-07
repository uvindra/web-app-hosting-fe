import { useQuery } from '@tanstack/react-query';
import { fetchMeta } from '../api/meta';

/** Target / feature flags reported by the BFF (e.g. whether the GitHub App flow exists). */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: fetchMeta, staleTime: 10 * 60 * 1000 });
}
