import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Where `npm run dev` proxies /api to. Start Ganymede with
// `ganymede serve --port 8888 --token <token>`.
const GANYMEDE = process.env.GANYMEDE_URL ?? 'http://127.0.0.1:8888';

// The optional agent's code: Pi, and the module the app loads it through.
function isAgentModule(id: string): boolean {
  return id.includes('/@earendil-works/') || id.endsWith('/packages/agent/src/models.ts');
}

type ModuleInfo = { importers: readonly string[]; dynamicImporters: readonly string[] } | null;

/** Rollup's module graph, kept from the build for naming chunks at output. */
const agentGraph: { info: (id: string) => ModuleInfo } = { info: () => null };

/** Whether every import path to `id` runs through the agent's code. */
function onlyForAgent(id: string, info: (id: string) => ModuleInfo): boolean {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const next = queue.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    if (next !== id && isAgentModule(next)) continue;
    const m = info(next);
    const importers = m ? [...m.importers, ...m.dynamicImporters] : [];
    // An entry, or a module the app reaches without the agent.
    if (importers.length === 0) return false;
    queue.push(...importers);
  }
  return true;
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
    {
      name: 'agent-module-graph',
      buildEnd() {
        agentGraph.info = id => this.getModuleInfo(id);
      },
    },
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
        // The agent (packages/agent) is off by default: cache its chunks
        // on first use too, not for everyone (ganymede-ui#165).
        globIgnores: ['**/fa-*.woff2', '**/agent-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/fa-[\w-]+\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'font-awesome' },
          },
          {
            urlPattern: /\/assets\/agent-[\w.-]+\.js$/,
            handler: 'CacheFirst',
            // Hashed names: each release adds new ones, so keep the cache bounded.
            options: { cacheName: 'agent', expiration: { maxEntries: 40 } },
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
    // One React: JupyterLab's packages pin React 18 copies of their own,
    // and hooks fail across copies. @vitejs/plugin-react set this before
    // version 5.
    dedupe: ['react', 'react-dom'],
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
  build: {
    // Vite 7's default baseline. Vite 8's (safari16.4) is above the Apple
    // apps' deployment targets, macOS 13.0 and iOS 16.0, whose WKWebView is
    // Safari 16.0 (apple/project.yml). The CSS target follows this one.
    target: ['chrome107', 'edge107', 'firefox104', 'safari16'],
    rolldownOptions: {
      // kernel.html is the Apple apps' hidden kernel web view (#99).
      input: { main: 'index.html', kernel: 'kernel.html' },
      output: {
        // The agent's lazy chunks (Pi and its providers) get an `agent-`
        // prefix, which the PWA's precache leaves out.
        // A chunk counts as the agent's when it holds Pi, or when every
        // module in it is reached only through Pi (Pi's own dependencies).
        chunkFileNames: chunk =>
          chunk.moduleIds.some(isAgentModule) ||
          (chunk.moduleIds.length > 0 &&
            chunk.moduleIds.every(id => onlyForAgent(id, agentGraph.info)))
            ? 'assets/agent-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
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
  },
  server: { proxy },
  preview: { proxy },
});
