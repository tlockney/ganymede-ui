import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Where `npm run dev` proxies /api to. Start Ganymede with
// `ganymede serve --port 8888 --token <token>`.
const GANYMEDE = process.env.GANYMEDE_URL ?? 'http://127.0.0.1:8888';

// `@jupyter-widgets/controls` reads its version with a CommonJS
// `require('../package.json')` inside an ES module, which webpack allows and
// Vite doesn't. Inline the version. Runs in the build and in the dev
// server's dependency pre-bundling. Needed for ipywidgets (src/lib/widgets.ts).
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
    // JupyterLab's icons import SVG files as strings (webpack's raw
    // loader); in Vite a bare `.svg` import is a URL. Ask for `?raw` instead
    // for JupyterLab's own packages.
    {
      name: 'jupyterlab-svg-as-string',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!source.endsWith('.svg') || !importer?.includes('/node_modules/@jupyterlab/')) {
          return null;
        }
        const resolved = await this.resolve(source + '?raw', importer, { skipSelf: true });
        return resolved ? resolved.id : null;
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
        // JupyterLab and MathJax make large chunks.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // SVGs only from icons/: the others are legacy font fallbacks.
        globPatterns: ['**/*.{js,css,html,png,woff2,wasm}', 'icons/*.svg'],
        // Font Awesome (ipywidgets' icons, src/styles/fontawesome.css): only
        // notebooks with icon widgets need it, so cache each font on first
        // use instead of precaching 170 kB for everyone.
        globIgnores: ['**/fa-*.woff2'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/fa-[\w-]+\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'font-awesome' },
          },
        ],
        // The server API is never cached.
        navigateFallbackDenylist: [/^\/api\//],
        // JupyterLite's service-worker relay (kernel file access and
        // stdin, public/lite-service-worker.js) runs inside this worker:
        // one origin gets one worker at `/`, and a narrower scope wouldn't
        // control the kernel Workers. `npm run dev` has no Workbox worker
        // and registers the relay alone (src/lib/lite-sw.ts).
        importScripts: ['lite-service-worker.js'],
      },
    }),
  ],
  resolve: {
    // JupyterLab stylesheets import packages webpack-style, `url('~pkg/...')`
    // (MathJax's fonts, for one).
    alias: [{ find: /^~(.*)$/, replacement: '$1' }],
  },
  define: {
    // Some CommonJS dependencies still read Node's `global` (seen under
    // `npm run dev`, where they are pre-bundled as is).
    global: 'globalThis',
    // MathJax's CommonJS build (@jupyterlab/mathjax-extension) reads
    // __dirname before it looks at the page.
    __dirname: '""',
  },
  worker: { format: 'es' },
  optimizeDeps: {
    // The JavaScript kernel starts its Worker with
    // `new URL('./worker-runtime.js', import.meta.url)`; pre-bundling moves
    // the module away from that file, so serve it as is in `npm run dev`.
    exclude: ['@jupyterlite/javascript-kernel'],
    // Its dependencies still need pre-bundling (CommonJS among them).
    include: [
      '@jupyterlite/javascript-kernel > @jupyterlab/coreutils',
      '@jupyterlite/javascript-kernel > @lumino/coreutils',
      '@jupyterlite/javascript-kernel > @jupyterlite/services',
      '@jupyterlite/javascript-kernel > comlink',
      '@jupyterlite/javascript-kernel > meriyah',
      '@jupyterlite/javascript-kernel > astring',
      // MathJax's CommonJS modules, which mathjax-extension loads with
      // dynamic imports: pre-bundled on their own they keep their named
      // exports (inside the extension's bundle `{ mathjax }` came back empty).
      ...[
        'mathjax',
        'output/chtml',
        'input/tex',
        'output/chtml/fonts/tex',
        'input/tex/AllPackages',
        'input/tex/require/RequireConfiguration',
        'ui/safe/SafeHandler',
        'handlers/html/HTMLHandler',
        'adaptors/browserAdaptor',
        'a11y/assistive-mml',
      ].map(m => `@jupyterlab/mathjax-extension > mathjax-full/js/${m}`),
    ],
    esbuildOptions: {
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
