import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit tests for the app in src/ and the agent package. Separate from
// vite.config.ts so the PWA and build plugins stay out of the test run.
export default defineConfig({
  plugins: [react()],
  // One React, as in vite.config.ts.
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'packages/agent/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    // @jupyter/web-components 0.17 is an ES module package whose icon
    // component imports `./icon.styles` with no extension, which Node
    // refuses to load. Inlined, Vite resolves it, as it does in the build.
    server: { deps: { inline: ['@jupyter/web-components'] } },
    // JupyterLab's theme variables are imported with `?inline`; process
    // them so the theme test sees the real stylesheets.
    css: { include: [/theme-(light|dark)-extension/] },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      reporter: [['text', { skipFull: false }], 'text-summary', 'html'],
    },
  },
});
