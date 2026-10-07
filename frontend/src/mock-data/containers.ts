import type { WebAppContainer } from '../types/containers';
import type { EnvironmentId } from '../types/webApp';

const HOUR = 60 * 60 * 1000;

export function buildContainers(webAppId: string, env: EnvironmentId): WebAppContainer[] {
  const name = webAppId.replace(/^webapp-/, '');
  return [
    {
      id: `${webAppId}-${env}-web`,
      name: 'web',
      image: `registry.webapp.wso2.com/${env}/${name}:7fb07eb`,
      imagePullPolicy: 'IfNotPresent',
      ports: [{ protocol: 'TCP', port: 8080 }],
      cpuRequest: 100,
      cpuLimit: 500,
      memoryRequest: 128,
      memoryLimit: 256,
      command: [],
      args: ['nginx', '-g', 'daemon off;'],
      updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    },
  ];
}
