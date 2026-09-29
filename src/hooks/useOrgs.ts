import { useQuery } from '@tanstack/react-query';
import { fetchOrgs } from '../api/orgs';

export function useOrgs() {
  return useQuery({
    queryKey: ['orgs'],
    queryFn: fetchOrgs,
    staleTime: 5 * 60 * 1000,
  });
}
