import type { Pod, PodEvent, ReleaseDetails } from '../types/runtime';
import type { EnvironmentId } from '../types/webApp';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString();
const MIB = 1024 ** 2;

/** Short app name derived from the web app id ("webapp-storefront" -> "storefront"). */
export function appName(webAppId: string): string {
  return webAppId.replace(/^webapp-/, '');
}

export function buildRelease(webAppId: string, env: EnvironmentId): ReleaseDetails {
  const name = appName(webAppId);
  return {
    status: 'Running',
    image: `registry.webapp.wso2.com/${env}/${name}:7fb07eb`,
    commitSha: '7fb07eb',
    commitMessage: 'Add test message to readme',
    deployedAt: iso(env === 'development' ? 2 * HOUR : 30 * HOUR),
    port: 8080,
  };
}

const readyConditions = (minsAgo: number): Pod['conditions'] =>
  (['PodScheduled', 'Initialized', 'ContainersReady', 'Ready'] as const).map((type, i) => ({
    type,
    status: 'True',
    lastTransitionTime: iso((minsAgo - i) * MIN),
  }));

export function buildPods(webAppId: string, env: EnvironmentId): Pod[] {
  const name = appName(webAppId);
  const count = env === 'production' ? 2 : 1;
  const suffixes = ['x7k2p', 'q9m4t'];
  return suffixes.slice(0, count).map((suffix, i) => ({
    name: `${name}-web-6d8f7b9c4-${suffix}`,
    phase: 'Running',
    ready: '1/1',
    restarts: i,
    startedAt: iso((120 - i * 25) * MIN),
    cpuUsageMillicores: 12 + i * 9,
    cpuLimitMillicores: 500,
    memoryUsageBytes: (48 + i * 14) * MIB,
    memoryLimitBytes: 256 * MIB,
    conditions: readyConditions(120 - i * 25),
  }));
}

export function buildEvents(): PodEvent[] {
  return [
    { type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned pod to node', count: 1, lastSeen: iso(120 * MIN) },
    { type: 'Normal', reason: 'Pulled', message: 'Container image already present on machine', count: 1, lastSeen: iso(119 * MIN) },
    { type: 'Normal', reason: 'Created', message: 'Created container web', count: 1, lastSeen: iso(119 * MIN) },
    { type: 'Normal', reason: 'Started', message: 'Started container web', count: 1, lastSeen: iso(119 * MIN) },
  ];
}

export function buildLogs(): string[] {
  const t = (minsAgo: number): string => new Date(Date.now() - minsAgo * MIN).toISOString();
  return [
    `${t(120)} [notice] nginx/1.27.0 starting worker processes`,
    `${t(120)} [notice] start worker process 29`,
    `${t(119)} Listening on http://0.0.0.0:8080`,
    `${t(45)} 10.42.0.17 - "GET / HTTP/1.1" 200 1843`,
    `${t(45)} 10.42.0.17 - "GET /assets/index-4f9a1c.js HTTP/1.1" 200 214883`,
    `${t(45)} 10.42.0.17 - "GET /assets/index-8b21de.css HTTP/1.1" 200 9120`,
    `${t(30)} 10.42.0.21 - "GET /favicon.ico HTTP/1.1" 200 1150`,
    `${t(12)} 10.42.0.21 - "GET /about HTTP/1.1" 200 1843`,
    `${t(3)} 10.42.0.17 - "GET /healthz HTTP/1.1" 200 2`,
  ];
}
