## 2026-11-01, device preload in the kernel web view (#99)

- `src/kernel-host.ts` passes ganymede-device's preload, `webkitHost()` and
  `capabilities: { device: true }` to each browser kernel, but only when
  the page sees a `device` WebKit message handler. Elsewhere (a browser,
  or the app before Swift registers one) kernels start as before and
  cells see no `device`.
- ganymede-device is a git dependency: its `prepare` script builds `dist/`
  on install (ganymede-device#4), so `preload.js?url` resolves to built
  JS. It is imported with `&no-inline`: at 2.8 kB it is under Vite's
  inline limit and would otherwise become a `data:` URL.
- The preload URL is made absolute against the page: the Worker imports
  it, and a relative URL would resolve against the Worker's own script.
- Still open for #99: the Swift `DeviceBridge` that answers `device`
  messages, planned as a Swift package in ganymede-device, registered on
  `KernelHost`'s web view only.
