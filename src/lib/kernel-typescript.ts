import urls from 'virtual:kernel-typescript';
import languageWorkerUrl from '@tlockney/cdp-kernel/browser/language-worker?worker&url';

/**
 * The browser kernel's `typescript` option (#668): TypeScript 6 and its lib
 * files, served by the app (scripts/kernel-typescript.ts), for typed
 * completion, tooltips, type errors, signature help, definition and rename
 * in the in-app and browser kernels. The language service runs in a Worker
 * of its own, started on the first request for typed help, so a notebook
 * that never asks fetches nothing.
 */
export function kernelTypescript() {
  // cdp-kernel resolves these against the page; absolute, they say where.
  const at = (url: string) => new URL(url, location.href).href;
  return {
    createWorker: () => new Worker(languageWorkerUrl, { type: 'module' }),
    module: at(urls.module),
    libs: at(urls.libs),
    runtimeTypes: at(urls.runtimeTypes),
  };
}
