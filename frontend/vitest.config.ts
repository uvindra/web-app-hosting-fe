import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // oxygen-ui's ESM build imports `prismjs/components/*` without extensions, which Node's
    // resolver rejects; let Vite transform it so component tests can render oxygen-ui.
    server: { deps: { inline: [/@wso2\/oxygen-ui/, /@mui\/x-/] } },
  },
});
