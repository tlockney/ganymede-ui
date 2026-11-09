## 2026-11-09, Headless script runner on JavaScriptCore (#433)

A spike for phase 4 of the device API (ganymede-device #69): share-sheet,
Shortcuts and widget runs need to execute a script or a notebook's code
cells with no window, and the native kernel (ganymede #266) is on hold.
Nothing in the app calls the runner yet.

`src/runner/` builds, with `npm run build:runner`, to one IIFE
(`dist-runner/engine.js`, about 236 kB, most of it sucrase) that
bootstrap.sh copies to `build/runner` and the app bundles in
`Resources/runner`. It installs what a bare JSContext lacks (console,
timers, fetch, TextEncoder/Decoder, base64, EventTarget,
AbortController, structuredClone), each only where missing so the same
code runs in vitest, then strips TypeScript and runs the code cells
joined as one async function, so a cell's `let` is seen by the next and
top-level `await` and `return` work. `import` and `export` are rejected:
there is nothing to load from.

`ScriptRunner` (Swift) gives the context the host functions behind
those: timers on `Timer`, console lines into the result, fetch over
URLSession (http and https only, 16 MiB), and a headless `EngineDevice`
with `attachRun`, so `device.input` and `device.output()` work and
methods that would prompt answer denied. A run stops waiting after its
time limit, 30 s by default, but JavaScriptCore can't interrupt a loop
that never yields, and has no public heap cap.

### Follow-ups from review (#441)

Each run has its own ephemeral URLSession, cancelled when the run ends,
so runs share no cookies and a stopped run's download stops. Top-level
`let` and `const` become `var`, so a cell can declare a name an earlier
cell did, as in a kernel. A small scanner finds them, skipping strings,
template literals, comments and anything in brackets; a regex literal
with a quote or backtick can still confuse it. Unlike a kernel, a `const`
can then be reassigned. The console keeps
JavaScriptCore's other methods; fetch sends header values as strings,
takes a `Headers`-like object, and rejects when its signal aborts
mid-call (the host request isn't cancelled). Base64 uses Uint8Array's
own `toBase64`/`fromBase64` where the engine has them.
