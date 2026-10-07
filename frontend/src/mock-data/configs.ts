import type { ConfigItem } from '../types/configs';
import type { EnvironmentId } from '../types/webApp';

const HOUR = 60 * 60 * 1000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();

export interface StoredConfig extends ConfigItem {
  /** Real secret values live only here in the stub; reads return them masked. */
  secretValues?: Record<string, string>;
}

export function buildConfigs(webAppId: string, env: EnvironmentId): StoredConfig[] {
  const apiBase = env === 'production' ? 'https://api.example.com' : 'https://api.dev.example.com';
  return [
    {
      id: `${webAppId}-${env}-app-config`,
      name: 'app-config',
      kind: 'config',
      updatedAt: ago(5),
      entries: [
        { key: 'API_BASE_URL', value: apiBase },
        { key: 'NODE_ENV', value: env === 'production' ? 'production' : 'development' },
        { key: 'PORT', value: '8080' },
      ],
    },
    {
      id: `${webAppId}-${env}-app-secrets`,
      name: 'app-secrets',
      kind: 'secret',
      updatedAt: ago(26),
      entries: [
        { key: 'ANALYTICS_API_KEY', value: '', masked: true },
        { key: 'SESSION_SECRET', value: '', masked: true },
      ],
      secretValues: { ANALYTICS_API_KEY: 'ak_live_51Nx9', SESSION_SECRET: 'c2Vzc2lvbi1zZWNyZXQ' },
    },
  ];
}
