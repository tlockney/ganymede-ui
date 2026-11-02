## 2026-11-01, Agent settings (#165)

The second step of the optional agent (#123): a Settings sheet with the agent off by default, and when on, a provider (Anthropic, OpenAI, Google, or a local OpenAI-compatible server), a model, and an API key. A Test button sends one short request with the unsaved settings.

Notes:

- The app imports `@ganymede-ui/agent/settings`, which has only type imports from pi-ai, and loads `@ganymede-ui/agent/models` with `import()` once the agent is on. The main chunk grew by about 2 kB gzipped; Pi and its providers are lazy chunks (about 15 kB gzipped for the models runtime, then 57 to 71 kB per provider API).
- Workbox precached every lazy chunk, so the agent would have downloaded for everyone who installs the PWA. `vite.config.ts` now names a chunk `agent-*` when it holds `@earendil-works` modules or when every module in it is reached only through them (found by walking Rollup's module graph, kept from `buildEnd`), leaves those out of the precache, and caches them on first use, like Font Awesome's fonts. Naming by path alone missed two small `node.browser` chunks of Pi's dependencies. `manualChunks` was tried and rejected: it merged every provider SDK into one 846 kB chunk. Rollup's `[name]` can contain a dot (`agent-node.browser-…`), so the runtime-cache pattern allows dots.
- Keys sit behind pi-ai's `CredentialStore`, so Pi's models read them at request time and the Apple apps can swap in a Keychain store (#166) without changing the agent.
- Keys stay out of IndexedDB on purpose: the in-page kernels run in Workers on the same origin, which can open IndexedDB but have no `localStorage` or `sessionStorage`. Output frames are sandboxed with an opaque origin, so they can't read either.
- pi-ai's OpenAI-compatible client refuses to send a request without an API key, so a local server with no key gets the placeholder `none`, which Ollama and LM Studio ignore. The unit test against a stubbed `fetch` found this.
- Ollama answers a page on another origin only if `OLLAMA_ORIGINS` allows it; the sheet says so.
- OpenAI's CORS from a browser was unsettled in the spike; the Test button is the way to find out with a real key.
- A blank base URL is not harmless: pi-ai passes it to the OpenAI client as `baseURL`, and the client falls back to `https://api.openai.com/v1`, so a local server's key would go to OpenAI. `models.ts` refuses anything but an http(s) URL for the local provider, and the Test button runs the form's checks first, as Save does.
- `autoComplete="off"` doesn't stop Chrome or Safari offering to save a password field; `new-password` does, which keeps the key out of the password manager.
