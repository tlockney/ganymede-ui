## 2026-11-26, where kernels run and remote status (#832)

The server (tlockney/ganymede#969) runs kernels on a remote through its
gateway, and `GET /api/kernelspecs` now says which: a top-level `gateway`
with the remote's name, whether it answers and its error, and `"gateway":
true` on each spec that runs there. Nothing said any of it before: a
kernel on another machine looked like one here, and a remote that had
stopped answering left an empty or puzzling list. Both keys are absent
from the released server, so every change is a no-op without them.

- JupyterLab's `KernelSpecManager` drops the keys it doesn't know: its
  `KernelSpec` reads `name`, `spec` and `resources` and nothing else, so
  `specs` can't carry the remote. The page asks `api/kernelspecs` itself
  through the backend's `serverSettings` and `ServerConnection.makeRequest`
  (as `src/lib/kernel-usage.ts` does), which keeps a machine's request
  under its mount. `src/lib/kernel-place.ts` holds the fetch, the 15 s
  poll (the server retries the remote at that pace), the label and the
  line, with unit tests.
- The page posts `kernels[].gateway` (the remote's name) and
  `kernelsRemote` (`{name, reachable, error}`) to the apps
  (`src/lib/native.ts`), which decode them into `PageState.Kernel.gateway`
  and `PageState.kernelsRemote`; a page from an older server leaves both
  absent.
- Every picker names where a kernel runs — the web's kernel menu and
  problem notice, the Mac's kernel popover, Kernel > Change Kernel and
  the iPad's and iPhone's kernel menu — and each ends with one disabled
  line while the remote isn't answering: "workmbp isn't answering: …".
  In a machine's window it names the machine too, "m4mini runs kernels on
  workmbp, which isn't answering", since the remote isn't reachable from
  this device to be seen on its own.
- `reachable: false` with no error is before the server's first check:
  the page and the apps say nothing then, rather than call a remote that
  may be fine down.
- Settings > Kernels on the Mac, and Settings > Remotes on the iPad and
  iPhone, show the line under Where Kernels Run, asking the kernelspecs
  every 15 s while a remote is chosen; the installed kernels' list on the
  Mac marks each remote kernel's row and ends with the same line, naming
  the remote as the app does.
- SwiftUI: the line is a computed view in each place, and the row's name a
  computed property, rather than a longer modifier chain (iOS CI has
  timed out type-checking those).

Left undone: the app passes no `gateway_name` to the server's config yet.
It uses `deny_unknown_fields`, and the released XCFramework (`GANYMEDE_REF`)
doesn't know the key, so the server would refuse to start. Pass it once
`GANYMEDE_REF` has ganymede#969 (#851).

## Pre-push review round

- Where Kernels Run keeps the server's answer with the remote it was
  fetched for: switching to This Mac or to another remote drops the last
  one's line, and a failed load doesn't leave another remote's standing.
- Settings > Kernels names a remote with the app's title, as Where Kernels
  Run does, in the rows and in the line.
- `PageState` and `KernelSpecs` share one `KernelsRemote.notAnswering`, so
  the line has one implementation.
- The problem notice's kernel picker ends with the not-answering line, as
  the docs and this log say; its test asserts that order.
- `useKernelPlaces` tests: a late answer for a server the page has left is
  ignored, a failed ask while a remote was named asks again, nothing is
  asked while the page is hidden, and a `focus` or `visibilitychange`
  asks.
- An App test posts a remote's `kernels[].gateway` and `kernelsRemote`,
  and finds both the mark and the line in the toolbar's kernel menu.
- `PageStateTests`' bodies include the keys `PageState` requires, so its
  nil-line check can fail; `XCTUnwrap` holds the state it asks.
- docs/apps.md's two notes say what the apps show and what the server
  needs: ganymede#969, and `GANYMEDE_REF` for the apps (#851). They, and
  the Mac's and the iPad's and iPhone's Settings screens above, are named
  apart.
