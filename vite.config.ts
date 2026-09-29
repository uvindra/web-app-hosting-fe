import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  server: {
    port: 3000,
    https: {},
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
    basicSsl(),
    react(),
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
