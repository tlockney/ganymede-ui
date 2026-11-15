import { copyFileSync, mkdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// Library build of the plugin to dist/main.js (CommonJS, as Obsidian loads
// it), with manifest.json and styles.css beside it: the three files to copy
// into <vault>/.obsidian/plugins/ganymede-notebooks/.
export default defineConfig({
  root: here,
  publicDir: false,
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: resolve(here, 'src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'obsidian',
        'electron',
        /^@codemirror\//,
        /^@lezer\//,
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: { exports: 'default' },
    },
  },
  plugins: [
    {
      name: 'copy-plugin-files',
      closeBundle() {
        mkdirSync(resolve(here, 'dist'), { recursive: true });
        for (const f of ['manifest.json', 'styles.css']) {
          copyFileSync(resolve(here, f), resolve(here, 'dist', f));
        }
      },
    },
  ],
});
