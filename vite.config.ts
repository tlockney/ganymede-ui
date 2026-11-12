import { defineConfig, type ProxyOptions, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The release error reports carry (src/lib/crash-reports.ts, #319):
// `ganymede-ui@<version>+<commit>`, so a TestFlight build from main and
// the release it follows don't share one.
function release(): string {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  let commit = process.env.GITHUB_SHA ?? '';
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      // Not a checkout: the version alone.
    }
  }
  return commit ? `ganymede-ui@${version}+${commit.slice(0, 12)}` : `ganymede-ui@${version}`;
}
process.env.VITE_RELEASE ??= release();

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

const config: UserConfig = {
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
    // Not in the Quick Look build (quickLook below).
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
        // The code fonts (public/fonts, #354): each page uses one, if any.
        globIgnores: ['**/fa-*.woff2', '**/agent-*.js', 'fonts/**'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/fa-[\w-]+\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'font-awesome' },
          },
          {
            // Versioned by `?v=<hash>` (catalog.json), so a rebuilt font gets a new URL.
            urlPattern: /\/fonts\/[\w-]+\.woff2(\?v=\w+)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'code-fonts', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /\/assets\/agent-[\w.-]+\.js$/,
            handler: 'CacheFirst',
            // Hashed names: each release adds new ones, so keep the cache bounded.
            options: { cacheName: 'agent', expiration: { maxEntries: 40 } },
          },
        ],
        // The server API is never cached. kernel.html is the Apple apps'
        // kernel page: with a query it misses the precache, and the
        // fallback would load the notebook app in its place (#518).
        navigateFallbackDenylist: [/^\/api\//, /^\/kernel\.html(\?|$)/],
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
    // Source maps for Sentry (scripts/sentry-sourcemaps.sh), which uploads
    // and then deletes them: `hidden` leaves no reference in the bundles.
    sourcemap: process.env.SENTRY_SOURCEMAPS === '1' ? 'hidden' : false,
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
};

/**
 * `vite build --mode quicklook`: the Mac app's Quick Look preview page
 * (preview.html, #135) alone, into dist-quicklook/. The extension bundles
 * it and serves it to its web view. No PWA: the page never has a server.
 */
function quickLook(base: UserConfig): UserConfig {
  return {
    ...base,
    plugins: base
      .plugins!.flat()
      .filter(p => !(p && 'name' in p && p.name.startsWith('vite-plugin-pwa'))),
    // public/ holds the PWA's icons and service-worker relay.
    publicDir: false,
    build: {
      ...base.build,
      outDir: 'dist-quicklook',
      // The preview page sends no error reports, so it needs no source maps.
      sourcemap: false,
      rolldownOptions: { input: { preview: 'preview.html' } },
    },
  };
}

/**
 * `vite build --mode runner`: the script runner's engine (src/runner, a
 * spike for #69) as one IIFE file in dist-runner/engine.js, which the
 * apps evaluate in a JavaScriptCore context with no web view.
 */
function runner(): UserConfig {
  return {
    publicDir: false,
    build: {
      outDir: 'dist-runner',
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      // JavaScriptCore on macOS 26 and iOS 26.
      target: 'safari26',
      lib: {
        entry: 'src/runner/engine.ts',
        formats: ['iife'],
        name: 'GanymedeRunner',
        fileName: () => 'engine.js',
      },
    },
  };
}

export default defineConfig(({ mode }) =>
  mode === 'quicklook' ? quickLook(config) : mode === 'runner' ? runner() : config,
);
