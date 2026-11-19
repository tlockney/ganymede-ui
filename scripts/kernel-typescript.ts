// TypeScript 6 for the browser kernel's language service (#668): typed
// completion, tooltips, type errors, signature help, definition and
// rename in the in-app kernel (iPad, iPhone, and the Mac without Node)
// and the browser's. cdp-kernel's `typescript` option takes URLs for
// TypeScript's `lib/typescript.js`, the `lib.*.d.ts` files
// `lib.esnext.d.ts` reaches, and the kernel package's `runtime/*.d.mts`,
// which type `jupyter` (cdp-kernel docs/integration-browser.md).
//
// `virtual:kernel-typescript` exports those three URLs. The build emits
// the files under kernel-typescript/, named by version so a new one is
// never answered from a cache; the dev server serves them from
// node_modules. Nothing loads them until a notebook asks the kernel for
// typed help: the language service's Worker starts on the first request.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL = 'virtual:kernel-typescript';
const RESOLVED = '\0' + VIRTUAL;
export const DIR = 'kernel-typescript';

const modulesDir = () => join(process.cwd(), 'node_modules');
const tsLib = () => join(modulesDir(), 'typescript', 'lib');
const runtimeDir = () => join(modulesDir(), '@tlockney', 'cdp-kernel', 'runtime');

function version(name: string): string {
  const path = join(modulesDir(), name, 'package.json');
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
}

/**
 * The `lib.*.d.ts` files `lib.esnext.d.ts` reaches through its
 * `/// <reference lib="…" />` lines: what the language service loads.
 * Not `lib.dom.d.ts` or `lib.webworker.d.ts` (3 MB), which it never asks for.
 */
export function esnextLibFiles(read: (name: string) => string): string[] {
  const found = new Set<string>();
  const todo = ['lib.esnext.d.ts'];
  for (let name = todo.pop(); name !== undefined; name = todo.pop()) {
    if (found.has(name)) continue;
    found.add(name);
    for (const m of read(name).matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g)) {
      todo.push(`lib.${m[1]!.toLowerCase()}.d.ts`);
    }
  }
  return [...found].sort();
}

/** Each file served, by its path under kernel-typescript/, and where it is on disk. */
export function servedFiles(): Map<string, string> {
  const ts = `typescript-${version('typescript')}`;
  const kernel = `cdp-kernel-${version('@tlockney/cdp-kernel')}`;
  const files = new Map<string, string>();
  files.set(`${ts}/typescript.js`, join(tsLib(), 'typescript.js'));
  for (const name of esnextLibFiles(n => readFileSync(join(tsLib(), n), 'utf8'))) {
    files.set(`${ts}/lib/${name}`, join(tsLib(), name));
  }
  for (const name of readdirSync(runtimeDir())) {
    if (name.endsWith('.d.mts')) files.set(`${kernel}/runtime/${name}`, join(runtimeDir(), name));
  }
  return files;
}

export function kernelTypescript(): Plugin {
  let base = '/';
  let used = false;
  let files: Map<string, string> | undefined;
  const served = () => (files ??= servedFiles());
  return {
    name: 'ganymede-kernel-typescript',
    configResolved(config) {
      base = config.base;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      used = true;
      const at = (dir: string) => `${base}${DIR}/${dir}`;
      const ts = `typescript-${version('typescript')}`;
      const kernel = `cdp-kernel-${version('@tlockney/cdp-kernel')}`;
      const urls = {
        module: at(`${ts}/typescript.js`),
        libs: at(`${ts}/lib/`),
        runtimeTypes: at(`${kernel}/runtime/`),
      };
      return `export default ${JSON.stringify(urls)};`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]!);
        const prefix = `${base}${DIR}/`;
        const disk = path.startsWith(prefix) ? served().get(path.slice(prefix.length)) : undefined;
        if (!disk) return next();
        res.setHeader('Content-Type', disk.endsWith('.js') ? 'text/javascript' : 'text/plain');
        res.end(readFileSync(disk));
      });
    },
    generateBundle() {
      // Only builds whose pages import the URLs (not Quick Look's preview).
      if (!used) return;
      for (const [name, disk] of served()) {
        this.emitFile({ type: 'asset', fileName: `${DIR}/${name}`, source: readFileSync(disk) });
      }
    },
  };
}
