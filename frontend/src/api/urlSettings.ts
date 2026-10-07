import type { CustomDomainInput, CustomDomainMapping, EnvironmentDefaultUrl } from '../types/urlSettings';
import { MOCK_CUSTOM_DOMAINS } from '../mock-data/urlSettings';
import { buildWebAppHost } from '../mock-data/deployments';
import { ENVIRONMENT_IDS } from '../constants/environments';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const store = new Map<string, CustomDomainMapping[]>();

function domainsFor(webAppId: string): CustomDomainMapping[] {
  let list = store.get(webAppId);
  if (!list) {
    list = (MOCK_CUSTOM_DOMAINS[webAppId] ?? []).map((d) => ({ ...d }));
    store.set(webAppId, list);
  }
  return list;
}

export async function fetchDefaultUrls(webApp: { id: string }): Promise<EnvironmentDefaultUrl[]> {
  await delay(NETWORK_DELAY_MS);
  return ENVIRONMENT_IDS.map((environment) => ({ environment, url: `https://${buildWebAppHost(webApp.id, environment)}` }));
}

export async function fetchCustomDomains(webAppId: string): Promise<CustomDomainMapping[]> {
  await delay(NETWORK_DELAY_MS);
  return domainsFor(webAppId).map((d) => ({ ...d }));
}

function assertUnique(list: CustomDomainMapping[], domain: string, exceptId?: string) {
  if (list.some((d) => d.domain === domain && d.id !== exceptId)) throw new Error(`The domain "${domain}" is already configured.`);
}

export async function createCustomDomain(webApp: { id: string }, input: CustomDomainInput): Promise<CustomDomainMapping> {
  await delay(NETWORK_DELAY_MS);
  const list = domainsFor(webApp.id);
  const domain = input.domain.trim().toLowerCase();
  assertUnique(list, domain);
  const mapping: CustomDomainMapping = { id: `dom-${Date.now()}`, environment: input.environment, domain, status: 'pending', cnameTarget: buildWebAppHost(webApp.id, input.environment), createdAt: new Date().toISOString() };
  list.push(mapping);
  return { ...mapping };
}

export async function updateCustomDomain(webAppId: string, id: string, input: CustomDomainInput): Promise<CustomDomainMapping> {
  await delay(NETWORK_DELAY_MS);
  const list = domainsFor(webAppId);
  const mapping = list.find((d) => d.id === id);
  if (!mapping) throw new Error('Custom domain not found.');
  const domain = input.domain.trim().toLowerCase();
  assertUnique(list, domain, id);
  if (domain !== mapping.domain) mapping.status = 'pending';
  mapping.domain = domain;
  return { ...mapping };
}

export async function deleteCustomDomain(webAppId: string, id: string): Promise<void> {
  await delay(NETWORK_DELAY_MS);
  store.set(
    webAppId,
    domainsFor(webAppId).filter((d) => d.id !== id),
  );
}

/** Simulates a DNS check: domains containing "fail" fail verification, all others succeed. */
export async function verifyCustomDomain(webAppId: string, id: string): Promise<CustomDomainMapping> {
  await delay(NETWORK_DELAY_MS * 2);
  const mapping = domainsFor(webAppId).find((d) => d.id === id);
  if (!mapping) throw new Error('Custom domain not found.');
  mapping.status = mapping.domain.includes('fail') ? 'failed' : 'verified';
  return { ...mapping };
}
