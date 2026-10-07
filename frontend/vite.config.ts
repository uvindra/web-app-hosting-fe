import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * `pnpm dev:local` (mode `openchoreo`): run the console against a local OpenChoreo on k3d.
 * - serves public/config.local.json as /config.json;
 * - proxies the BFF (/__bff → localhost:9090) and ThunderID (/__thunder → thunder.openchoreo.localhost:8080)
 *   so neither needs CORS for https://localhost:3000 (ThunderID's CORS list is install-time config).
 */
const LOCAL_BFF = process.env.WAH_LOCAL_BFF ?? 'http://localhost:9090';
const LOCAL_THUNDER_HOST = 'thunder.openchoreo.localhost';
const LOCAL_THUNDER = process.env.WAH_LOCAL_THUNDER ?? 'http://127.0.0.1:8080';

function localConfig(): Plugin {
  return {
    name: 'web-app-hosting-local-config',
    configureServer(server) {
      server.middlewares.use('/config.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(new URL('./public/config.local.json', import.meta.url)));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  server: {
    port: 3000,
    https: {},
    proxy:
      mode === 'openchoreo'
        ? {
            '/__bff': { target: LOCAL_BFF, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/__bff/, '/webapp-hosting/api/v1') },
            // ThunderID routes by Host header (k3d gateway), so dial 127.0.0.1 and send its host name.
            '/__thunder': { target: LOCAL_THUNDER, changeOrigin: false, headers: { host: LOCAL_THUNDER_HOST }, rewrite: (path: string) => path.replace(/^\/__thunder/, '') },
          }
        : undefined,
  },
  // Preview mirrors the dev server: the IdP only accepts redirects on :3000, and
  // `vite preview` reads none of `server`, so port and https are repeated here.
  preview: {
    port: 3000,
    strictPort: true,
    https: {},
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('oxygen-ui-icons-react')) return 'icons';
        },
      },
    },
  },
  plugins: [
    ...(mode === 'openchoreo' ? [localConfig()] : []),
    basicSsl(),
    react(),
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
}));
