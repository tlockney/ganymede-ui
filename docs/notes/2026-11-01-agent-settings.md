## 2026-11-01, Agent settings (#165)

The second step of the optional agent (#123): a Settings sheet with the agent off by default, and when on, a provider (Anthropic, OpenAI, Google, or a local OpenAI-compatible server), a model, and an API key. A Test button sends one short request with the unsaved settings.

Notes:

- The app imports `@ganymede-ui/agent/settings`, which has only type imports from pi-ai, and loads `@ganymede-ui/agent/models` with `import()` once the agent is on. The main chunk grew by about 2 kB gzipped; Pi and its providers are lazy chunks (about 15 kB gzipped for the models runtime, then 57 to 71 kB per provider API).
- Workbox precached every lazy chunk, so the agent would have downloaded for everyone who installs the PWA. `vite.config.ts` now names chunks that contain `@earendil-works` modules `agent-*`, leaves them out of the precache, and caches them on first use, like Font Awesome's fonts.
- Keys sit behind pi-ai's `CredentialStore`, so Pi's models read them at request time and the Apple apps can swap in a Keychain store (#166) without changing the agent.
- Keys stay out of IndexedDB on purpose: the in-page kernels run in Workers on the same origin, which can open IndexedDB but have no `localStorage` or `sessionStorage`. Output frames are sandboxed with an opaque origin, so they can't read either.
- pi-ai's OpenAI-compatible client refuses to send a request without an API key, so a local server with no key gets the placeholder `none`, which Ollama and LM Studio ignore. The unit test against a stubbed `fetch` found this.
- Ollama answers a page on another origin only if `OLLAMA_ORIGINS` allows it; the sheet says so.
- OpenAI's CORS from a browser was unsettled in the spike; the Test button is the way to find out with a real key.
