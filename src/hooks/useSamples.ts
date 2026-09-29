import { useQuery } from '@tanstack/react-query';
import { fetchSamples } from '../api/samples';

export function useSamples() {
  return useQuery({
    queryKey: ['samples'],
    queryFn: fetchSamples,
    staleTime: 5 * 60 * 1000,
  });
}
