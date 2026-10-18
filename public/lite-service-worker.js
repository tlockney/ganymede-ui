/*
 * JupyterLite's service-worker requests, without JupyterLite's service worker.
 *
 * Kernels that run in a Worker and need synchronous answers from the page
 * (Emscripten's DriveFS reading and writing notebook files, `input()` over
 * stdin) make a synchronous XMLHttpRequest to `api/drive` or
 * `api/stdin/<kind>` at this origin. A service worker catches it and relays
 * it on the `/sw-api.v1` BroadcastChannel to the page, whose answer becomes
 * the response (src/lib/lite-sw.ts holds the page side). This file is the
 * relay part of `@jupyterlite/apputils/lib/service-worker.js` 0.8.6
 * (BSD-3-Clause, Copyright (c) Jupyter Development Team), adapted; its
 * cache is left out, since Workbox does the caching here.
 *
 * One origin has one service worker per scope, and the page and the kernel
 * Workers must all be controlled by it, so this can't have a scope of its
 * own (`/lite/`, say): a worker is controlled by the scope its own URL
 * falls in, not the scope of the URLs it requests. Instead it is loaded
 * into the one worker at `/`:
 *
 * - production build: Workbox's generated `sw.js` pulls it in with
 *   `importScripts` (`workbox.importScripts` in vite.config.ts). Its fetch
 *   listener is added before Workbox's, answers only the relay requests and
 *   leaves everything else to Workbox's precache.
 * - `npm run dev`: there is no Workbox worker, so the page registers this
 *   file alone (src/lib/lite-sw.ts).
 *
 * A plain script, not a module, so `importScripts` can load it.
 */

(() => {
  const channel = new BroadcastChannel('/sw-api.v1');

  // In dev this file is the whole service worker: take over at once, as
  // Workbox's does in the build (registerType: 'autoUpdate').
  if (!self.define) {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  }

  self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (
      url.origin === location.origin &&
      event.request.method === 'POST' &&
      (url.pathname.endsWith('/api/drive') || url.pathname.includes('/api/stdin/'))
    ) {
      event.respondWith(relay(event.request, url));
    }
  });

  /** Hand the request to the page that started the kernel; wait for its answer. */
  async function relay(request, url) {
    const message = await request.json();
    const requestId = message.requestId ?? crypto.randomUUID();
    message.requestId = requestId;
    message.pathname = url.pathname;
    const answer = new Promise(resolve => {
      const onMessage = event => {
        const data = event.data;
        // Several pages, and several kernels in one page, share the channel.
        if (data.browsingContextId !== message.browsingContextId || data.requestId !== requestId) {
          return;
        }
        channel.removeEventListener('message', onMessage);
        resolve(new Response(JSON.stringify(data.response)));
      };
      channel.addEventListener('message', onMessage);
    });
    channel.postMessage(message);
    return answer;
  }
})();
