## 2026-11-28, in-app kernel provider socket client (#941)

Next step of `tlockney/ganymede#965` §4: connecting the Mac app's in-app
TypeScript WebView kernel (`cdp-browser`) to a verified background
`ganymede serve` over its Unix domain provider socket
(`ganymede-kernels-<pid>.sock`, advertised as `kernel_providers_socket` in
`jpserver-<pid>.json`), while keeping the embedded server's in-process C
ABI registration unchanged.

- **Protocol client (`KernelProviderClient.swift`, `#if os(macOS)`).**
  Implements Ganymede's newline-delimited JSON protocol over POSIX `AF_UNIX`
  stream sockets (`SO_NOSIGPIPE`, non-blocking `DispatchSourceRead` on a
  dedicated serial I/O queue, `poll(POLLOUT)` bounded writes, and a 64 MiB
  streaming line cap matching `MAX_LINE` in `kernel_providers.rs`):
  - Handshake sends `hello` with the verified server's token under a
    configurable timeout, awaits `welcome`, then sends `register` with
    display-only kernelspec fields (`name`, `display_name`, `language`,
    `metadata` — stripping any `argv`/`env`).
  - Handles `start` (acknowledging with `started`), `send`, and `stop` by
    dispatching `KernelEvent` to `AppKernels`, and sends `deliver` (with
    parsed JSON object `msg`) and `ended` (normalizing any non-`"lost"`
    reason such as `"failed"` to `"exited"`, since the server rejects unknown
    `reason` strings) back over the socket.
  - Sends `unregister` best-effort on clean disconnect, rejects malformed,
    unexpected, or oversized frames by closing the socket, and drops stale
    runs cleanly.
- **Shared `KernelSink` abstraction.** Extracted `KernelSink` in
  `ServerHost.swift` (conformed by both `RegisteredKernels` and
  `KernelProviderClient`) so `AppKernels` serves embedded and background
  servers through one `handle(_:from:notebookRoot:)` path, resolves relative
  `JPY_SESSION_NAME` paths against each server's `root_dir`, and detaches
  only a disconnected provider's kernels via `AppKernels.detach(_:)`.
- **Automatic discovery and reconnect.** `ThisMacServer` and
  `ThisMacVerifier` now read `kernel_providers_socket` from
  `jpserver-<pid>.json`. `ThisMacChecks` tracks all verified servers
  (including background servers with no saved Remote entry), watches their
  PIDs, and notifies `KernelProviderManager`, which connects automatically,
  reconnects with bounded backoff on unexpected drops or server restarts,
  and disconnects synchronously on app quit (`AppModel.stopForQuit`).
- **Name reservation helper (`KernelProviderReservation`).** Formats the
  macOS `csreq` code requirement string (`identifier "<bundle>" and anchor
apple generic and certificate leaf[subject.OU] = "<team>"`) with
  identifier/team validation, builds `[kernel_providers]` config patches
  for `ganymede.toml`, and omits `reserve` on unsigned debug builds where
  no team ID is present.
- **No `GANYMEDE_REF` bump.** Pure POSIX Unix sockets compile cleanly
  against the current `v0.17.0` XCFramework while interoperating with
  Ganymede's provider socket once `GANYMEDE_REF` moves forward in `#902`.
- **Tests.** `KernelProviderClientTests.swift` covers framing, display-only
  spec sanitization, oversized/malformed frame rejection, full
  `hello`/`register`/`start`/`send`/`deliver`/`stop`/`ended`/`unregister`
  round-trips over `socketpair`, real temp Unix socket connect/restart/drop
  reconnect through `KernelProviderManager`, `ThisMacVerifier` and
  `ThisMacChecks` socket discovery, and `KernelProviderReservation`
  (validated against macOS's `SecRequirementCreateWithString`).
