import type { WebApp } from '../types/webApp';

/**
 * The project home subtitle: the total, plus how many are deployed. A web app counts as deployed when it has
 * a deployment in the pipeline's first environment (its status is anything but `not-deployed`; the BFF
 * derives `status` from that environment).
 */
export function webAppSummary(webApps: readonly Pick<WebApp, 'status'>[]): string {
  const total = webApps.length;
  const noun = `web application${total === 1 ? '' : 's'}`;
  if (total === 0) return `0 ${noun}`;
  const deployed = webApps.filter((a) => a.status !== 'not-deployed').length;
  return `${total} ${noun} · ${deployed} deployed`;
}
