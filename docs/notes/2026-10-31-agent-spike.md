## 2026-10-31, Pi Durable agent spike (#124)

Spike for the optional built-in agent (#123): can Pi Durable
(`@earendil-works/pi-durable` 1.4.0, MIT) run in ganymede-ui and drive a
notebook? The code is in `packages/agent/`. The app does not import it yet.

What it has:

- `src/tools.ts`: one extension with three tools. `notebook_read` and
  `notebook_edit` work on the open notebook's shared model
  (`ISharedNotebook`), so edits appear in the open notebook and the app's
  saver still does every write. `kernel_execute` runs code through the
  notebook's `IKernelConnection` and returns the text it printed. A
  `beforeTool` hook asks `approve()` before code runs and blocks the call
  if the person declines. The hook runs before the call's intent is
  stored, so after a crash the person is asked again.
- `src/index.ts`: `openAgent()` opens a Harness on the storage it is
  given, sets the provider attribution to Ganymede instead of pi, and
  resumes unfinished runs.
- `src/agent.test.ts`: tests with pi-ai's faux provider, a `YNotebook`
  and a fake kernel. They cover edit and run, a declined run, and a
  resume from IndexedDB (`fake-indexeddb`). In the resume test the page
  is dropped while a kernel call is in flight. On reopen, the stored edit
  remains, the call is reported as interrupted and not rerun (it isn't
  marked replay-safe), and the model answers.

Findings:

- **Runs in the browser.** pi-durable and pi-ai bundle with Vite with no
  Node shims, and IndexedDB storage works. One caveat: a faux message
  needs `stopReason: 'toolUse'`, or its tool calls are never run.
- **Run it in the page, not a Worker.** The tools need the notebook's
  shared model and kernel connection, and both live in the page. A
  Worker would have to relay every tool call back to the page. The page
  is a safe enough place for the key: outputs render in opaque-origin
  frames, and kernels run in Workers or the hidden kernel web view.
- **Size** (`npx vite build -c packages/agent/vite.spike.config.ts`):
  the harness, storage and tools are 603 kB (144 kB gzip). Each provider
  loads as a lazy chunk on first use: Anthropic 92 kB, OpenAI 110 kB and
  Google 90 kB gzip. So turning the agent on with one provider adds about
  240 kB gzip. All of the app's JS today is about 1.7 MB gzip.
- **CORS** (`spike/cors.ts`, run from Chromium on an `http://127.0.0.1`
  origin with a bogus key):
  - Anthropic and Google: the request reaches the API and gets an auth
    error, so browser calls work.
  - OpenAI: blocked. The 401 response has no `Access-Control-Allow-Origin`
    header, though the preflight passes. This needs a real key to tell
    whether only error responses lack the header.
  - OpenRouter: its first catalog model uses the Anthropic API shape.
    pi-ai sends `anthropic-dangerous-direct-browser-access`, which
    OpenRouter's preflight refuses. Its OpenAI-shaped models, or dropping
    that header, should work.
  - Ollama: not tested here. It accepts `127.0.0.1` and `localhost`
    origins by default, which is where the Mac app serves the page.
- **Licenses.** The pi packages, chord, TypeBox and the Anthropic SDK
  are MIT. The OpenAI, Google and Bedrock SDKs and Photon are
  Apache-2.0, and `diff` is BSD-3-Clause. A release that bundles them
  carries their notices.

Not done: Pi's file and shell tools need an `ExecutionEnv` over the
contents and terminals APIs (ganymede#232), and that is a full
filesystem interface. Testing in the Mac and iPad web views needs a Mac.
