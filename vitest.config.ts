import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit tests for the app in src/ (the client package runs its own with
// node --test). Separate from vite.config.ts so the PWA and build plugins
// stay out of the test run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'packages/agent/src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
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
