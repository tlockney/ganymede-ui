import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { treatAsCommonjs } from 'vite-plugin-treat-umd-as-commonjs';
import { VitePWA } from 'vite-plugin-pwa';

// Where `npm run dev` proxies /api to. Start Ganymede with
// `ganymede serve --port 8888 --token <token>`.
const GANYMEDE = process.env.GANYMEDE_URL ?? 'http://127.0.0.1:8888';

// @jupyter-widgets packages read their version with a CommonJS
// `require('../package.json')` inside ES modules. jupyter-ui's example papers
// over it by loading require.js from a CDN; inline the version instead. Runs
// in the build and in the dev server's dependency pre-bundling.
const VERSION_REQUIRE = /require\(['"]\.\.\/package\.json['"]\)\.version/;
function inlinePackageVersion(code: string, id: string): string | null {
  if (!id.includes('@jupyter-widgets') || !VERSION_REQUIRE.test(code)) return null;
  const pkg = JSON.parse(readFileSync(resolve(dirname(id), '../package.json'), 'utf8'));
  return code.replace(VERSION_REQUIRE, JSON.stringify(pkg.version));
}

// Proxy the API so the page and the server share an origin. Ganymede checks
// Origin against Host, as jupyter_server does, so rewrite both.
const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: GANYMEDE,
    ws: true,
    changeOrigin: true,
    configure: p => {
      p.on('proxyReq', req => req.setHeader('origin', GANYMEDE));
      p.on('proxyReqWs', req => req.setHeader('origin', GANYMEDE));
    },
  },
};

export default defineConfig({
  plugins: [
    react(),
    treatAsCommonjs(),
    // The next two plugins come from datalayer/jupyter-ui's Vite example:
    // JupyterLab packages import CSS and text with webpack loader suffixes.
    {
      name: 'raw-css-as-string',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (source.endsWith('.raw.css') && !source.includes('?raw')) {
          const resolved = await this.resolve(source + '?raw', importer, {
            skipSelf: true,
          });
          return resolved ? resolved.id : null;
        }
        return null;
      },
    },
    {
      name: 'fix-text-query',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (source.includes('?text')) {
          const fixed = source.replace('?text', '?raw');
          const resolved = await this.resolve(fixed, importer, {
            skipSelf: true,
          });
          return resolved ? resolved.id : fixed;
        }
        return null;
      },
    },
    {
      name: 'inline-package-version',
      transform: (code, id) => inlinePackageVersion(code, id),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Ganymede',
        short_name: 'Ganymede',
        description: 'Notebooks for Ganymede and in-browser kernels.',
        display: 'standalone',
        // Chromium on macOS: draw our own titlebar next to the window controls.
        display_override: ['window-controls-overlay', 'standalone'],
        background_color: '#f5f5f7',
        theme_color: '#f5f5f7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // JupyterLab and the in-browser kernels make large chunks.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        // The server API is never cached.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  assetsInclude: ['**/*.whl', '**/*.raw.css'],
  resolve: {
    alias: [{ find: /^~(.*)$/, replacement: '$1' }],
  },
  define: {
    global: 'globalThis',
    __webpack_public_path__: '""',
    // MathJax's CommonJS build reads __dirname before it looks at the page.
    __dirname: '""',
  },
  worker: { format: 'es' },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.whl': 'text' },
      plugins: [
        {
          name: 'inline-package-version',
          setup(build) {
            build.onLoad({ filter: /@jupyter-widgets[\\/].*\.js$/ }, args => {
              const code = readFileSync(args.path, 'utf8');
              const out = inlinePackageVersion(code, args.path);
              return out === null ? undefined : { contents: out, loader: 'js' };
            });
          },
        },
      ],
    },
  },
  server: { proxy },
  preview: { proxy },
});
