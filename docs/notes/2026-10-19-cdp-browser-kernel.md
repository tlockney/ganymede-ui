## 2026-10-19, cdp-kernel's TypeScript kernel in browser mode (#66)

Browser mode now registers cdp-kernel's browser kernel
(`@tlockney/cdp-kernel/browser`, 0.7.0) as a JupyterLite kernel next to
the JavaScript one. `src/lib/cdp-kernel.ts` adapts it: cdp-kernel
answers every request itself, so Jupyter messages pass through as they
are, and cells run in its module Worker, bundled by Vite through
`@tlockney/cdp-kernel/browser/worker?worker&url` (about 175 kB, most of
it sucrase for stripping types).

Two things JupyterLite assumes that cdp-kernel's kernel doesn't do:

- `LiteKernelClient` routes a kernel's messages to a connection by
  `header.session`. cdp-kernel stamps its own session id, so the kernel
  status stayed "Unknown" until the adapter rewrote `header.session` to
  the parent's session (or the last session that sent a request).
- `LiteKernelClient.interrupt` is a no-op for kernels without a
  JupyterLite worker. `CdpAwareKernelClient` overrides it to send an
  `interrupt_request` on the control channel, reaching the kernel
  through the client's private `_kernels` map; recheck it when
  `@jupyterlite/services` changes.

JupyterLite's default kernel is the first name in sorted order, so
`cdp-browser` is now the default over `javascript`.
