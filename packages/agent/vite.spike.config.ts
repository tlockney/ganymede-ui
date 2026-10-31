import { defineConfig } from 'vite';

// Measures what the agent adds to the app (ganymede-ui#124):
// npx vite build -c packages/agent/vite.spike.config.ts
export default defineConfig({
  root: __dirname,
  logLevel: 'info',
  build: {
    outDir: 'dist-spike',
    emptyOutDir: true,
    target: 'es2022',
    lib: { entry: process.env.SPIKE_ENTRY ?? 'spike/entry.ts', formats: ['es'], fileName: 'agent' },
    rollupOptions: { external: [/^@jupyterlab\//, /^@jupyter\//] },
  },
});
