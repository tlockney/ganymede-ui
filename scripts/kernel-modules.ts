// The chart libraries jupyter.chart imports (vega, vega-lite, linkedom),
// bundled into the app so charts draw offline (ganymede#747, decision 7).
//
// `virtual:kernel-modules` exports a map from the specifier cdp-kernel
// imports (its CHART_MODULES) to the URL the app serves the module at;
// src/lib/kernel-modules.ts passes it to the browser kernel's `modules`
// option. Each package is bundled into one ES module, as esm.sh would
// serve it. The build emits them under kernel-modules/,
// named by version so a new one is never answered from a cache; the dev
// server bundles each on its first request.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL = 'virtual:kernel-modules';
const RESOLVED = '\0' + VIRTUAL;
const DIR = 'kernel-modules';

/** cdp-kernel's specifier (its CHART_MODULES) -> the package bundled for it. */
export const PACKAGES: { readonly [specifier: string]: string } = {
  'npm:vega@6': 'vega',
  'npm:vega-lite@6': 'vega-lite',
  'npm:linkedom@0.18': 'linkedom',
};

function version(name: string): string {
  // Not require.resolve: vega's exports don't include package.json.
  const path = join(process.cwd(), 'node_modules', name, 'package.json');
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
}

/** The file each package's bundle is served as, under kernel-modules/. */
function fileName(name: string): string {
  return `${name}-${version(name)}.js`;
}

async function bundle(name: string): Promise<string> {
  // Vite's own build, in library mode, of a module that re-exports the
  // package: one ES module, nothing left to import.
  const { build } = await import('vite');
  const entry = 'virtual:kernel-module-entry';
  const result = await build({
    configFile: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'kernel-module-entry',
        enforce: 'pre',
        // Library mode makes the entry a path under the root.
        resolveId: id => (id.endsWith(entry) ? '\0' + entry : undefined),
        load: id => (id === '\0' + entry ? `export * from ${JSON.stringify(name)};` : undefined),
      },
    ],
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: { entry, formats: ['es'], fileName: () => `${name}.js` },
      rolldownOptions: { output: { codeSplitting: false, minify: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(r =>
    'output' in r ? r.output : [],
  );
  const chunks = outputs.filter(o => o.type === 'chunk');
  if (chunks.length !== 1) throw new Error(`${name}: expected one module, got ${chunks.length}`);
  return chunks[0].code;
}

export function kernelModules(): Plugin {
  let base = '/';
  let used = false;
  const files = new Map(Object.values(PACKAGES).map(name => [fileName(name), name]));
  const built = new Map<string, Promise<string>>();
  const code = (file: string) => {
    let pending = built.get(file);
    if (!pending) {
      pending = bundle(files.get(file)!);
      built.set(file, pending);
    }
    return pending;
  };
  return {
    name: 'ganymede-kernel-modules',
    configResolved(config) {
      base = config.base;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      used = true;
      const map = Object.fromEntries(
        Object.entries(PACKAGES).map(([specifier, name]) => [
          specifier,
          `${base}${DIR}/${fileName(name)}`,
        ]),
      );
      return `export default ${JSON.stringify(map)};`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const prefix = `${base}${DIR}/`;
        const file = path.startsWith(prefix) ? path.slice(prefix.length) : '';
        if (!files.has(file)) return next();
        code(file).then(
          text => {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(text);
          },
          err => next(err),
        );
      });
    },
    async generateBundle() {
      // Only builds whose pages import the map (not Quick Look's preview).
      if (!used) return;
      for (const file of files.keys()) {
        this.emitFile({ type: 'asset', fileName: `${DIR}/${file}`, source: await code(file) });
      }
    },
  };
}
