import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL = 'virtual:sql-preload';
const RESOLVED = '\0' + VIRTUAL;

/**
 * Serves and bundles `src/lib/sql-preload.ts` as a standalone ES module
 * URL for browser and in-app kernel workers (#678).
 *
 * - In dev and Vitest: resolves to the module path Vite serves directly.
 * - In build: emits a content-hashed Rollup chunk preserving its `default`
 *   export, only when a target imports `virtual:sql-preload` (so Quick Look's
 *   build emits nothing).
 */
export function sqlPreload(): Plugin {
  let command: 'build' | 'serve' = 'serve';
  let base = '/';
  return {
    name: 'ganymede-sql-preload',
    configResolved(config) {
      command = config.command;
      base = config.base;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      if (command !== 'build') {
        return `export default ${JSON.stringify(`${base}src/lib/sql-preload.ts`)};`;
      }
      const ref = this.emitFile({
        type: 'chunk',
        id: resolve(process.cwd(), 'src/lib/sql-preload.ts'),
        preserveSignature: 'exports-only',
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
