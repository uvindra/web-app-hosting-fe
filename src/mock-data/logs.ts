import type { LogLevel, LogRow } from '../types/logs';
import { levelForStatus } from '../utils/logs';
import { seededRandom } from '../utils/metrics';

const MINUTE_MS = 60 * 1000;
const ENTRY_COUNT = 400;

const ASSET_PATHS = ['/', '/index.html', '/assets/index-3f9a2c.js', '/assets/index-8b41de.css', '/assets/vendor-51c0a7.js', '/favicon.ico', '/static/logo.svg', '/manifest.json'];
const ROUTE_PATHS = ['/dashboard', '/products', '/products/42', '/login', '/settings/profile', '/api/session', '/api/products?page=2'];
const MISSING_PATHS = ['/wp-login.php', '/robots.txt', '/old-page', '/.env'];
const STATUS_TEXT: Record<number, string> = { 200: 'OK', 304: 'Not Modified', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway' };

const APP_LINES: { level: LogLevel; line: string }[] = [
  { level: 'INFO', line: '[server] Listening on http://0.0.0.0:8080' },
  { level: 'INFO', line: '[server] Serving static files from /app/dist' },
  { level: 'DEBUG', line: '[cache] HIT /assets/index-3f9a2c.js (max-age=31536000)' },
  { level: 'DEBUG', line: '[cache] MISS /index.html, revalidating' },
  { level: 'WARN', line: '[server] Slow response for GET /api/products?page=2 (1204ms)' },
  { level: 'WARN', line: '[gzip] Skipping compression for /static/logo.svg: already compressed' },
  { level: 'ERROR', line: '[proxy] upstream timed out (110: Connection timed out) while reading response header for /api/session' },
  { level: 'ERROR', line: "[server] Unhandled rejection: TypeError: Cannot read properties of undefined (reading 'user')" },
];

const pick = <T>(rand: () => number, items: T[]): T => items[Math.floor(rand() * items.length)];

function accessRow(rand: () => number, id: string, timestamp: string, podName: string): LogRow {
  const roll = rand();
  const status = roll < 0.72 ? 200 : roll < 0.84 ? 304 : roll < 0.94 ? 404 : roll < 0.98 ? 500 : 502;
  const path = status === 404 ? pick(rand, MISSING_PATHS) : pick(rand, rand() < 0.6 ? ASSET_PATHS : ROUTE_PATHS);
  const bytes = status === 304 ? 0 : Math.round(300 + rand() * 180_000);
  const durationMs = Math.round(status >= 500 ? 400 + rand() * 1500 : 1 + rand() * 40);
  return {
    id,
    timestamp,
    level: levelForStatus(status),
    source: 'access',
    podName,
    containerName: 'web',
    method: 'GET',
    path,
    statusCode: status,
    durationMs,
    logLine: `GET ${path} ${status} ${STATUS_TEXT[status]} ${bytes}B ${durationMs}ms`,
  };
}

/** Deterministic web-server-style logs (request lines plus server process output), newest first. */
export function generateLogs(seed: string, now: number = Date.now()): LogRow[] {
  const rand = seededRandom(seed);
  const pods = [`${seed.split(':')[0].replace(/^webapp-/, '')}-7c9d8b6f54-x4k2p`, `${seed.split(':')[0].replace(/^webapp-/, '')}-7c9d8b6f54-q9w7m`];
  const rows: LogRow[] = [];
  let time = now - 5_000;
  for (let i = 0; i < ENTRY_COUNT; i++) {
    // Dense in the last half hour, sparser further back, so every time preset has content.
    time -= i < 80 ? 5_000 + rand() * 40_000 : 5 * MINUTE_MS + rand() * 40 * MINUTE_MS;
    const timestamp = new Date(time).toISOString();
    const podName = pick(rand, pods);
    const id = `${seed}-${i}`;
    if (rand() < 0.78) {
      rows.push(accessRow(rand, id, timestamp, podName));
    } else {
      const { level, line } = pick(rand, APP_LINES);
      rows.push({ id, timestamp, level, logLine: line, source: 'app', podName, containerName: 'web' });
    }
  }
  return rows;
}
