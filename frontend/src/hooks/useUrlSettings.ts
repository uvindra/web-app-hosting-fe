import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCustomDomain, deleteCustomDomain, fetchCustomDomains, fetchDefaultUrls, updateCustomDomain, verifyCustomDomain } from '../api/urlSettings';
import type { CustomDomainInput } from '../types/urlSettings';

interface WebAppRef {
  id: string;
  handler: string;
  url?: string;
}

const domainsKey = (webAppId: string) => ['customDomains', webAppId];

export function useDefaultUrls(webApp: WebAppRef) {
  return useQuery({ queryKey: ['defaultUrls', webApp.id], queryFn: () => fetchDefaultUrls(webApp), enabled: !!webApp.id });
}

export function useCustomDomains(webAppId: string) {
  return useQuery({ queryKey: domainsKey(webAppId), queryFn: () => fetchCustomDomains(webAppId), enabled: !!webAppId });
}

export function useCreateCustomDomain(webApp: WebAppRef) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomDomainInput) => createCustomDomain(webApp, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: domainsKey(webApp.id) }),
  });
}

export function useUpdateCustomDomain(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomDomainInput }) => updateCustomDomain(webAppId, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: domainsKey(webAppId) }),
  });
}

export function useDeleteCustomDomain(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomDomain(webAppId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: domainsKey(webAppId) }),
  });
}

export function useVerifyCustomDomain(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => verifyCustomDomain(webAppId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: domainsKey(webAppId) }),
  });
}
