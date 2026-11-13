## 2026-11-13, the kernel web view has its own data store (#557)

The security read of 2026-11-13 found that `AppKernels` built its web
view from a default `WKWebViewConfiguration`, so it shared the default
website data store, and the server's login cookie, with the notebook
pages. `kernel.html` loads from the server's origin and cdp-kernel runs
cells in a module Worker there, so a cell's `fetch` and `WebSocket`
carried the cookie: it could read any file under the root (`/` on the
Mac) through the contents API, whatever the notebook's host grant, and
open any other kernel's channels. Cookie-only writes failed the XSRF
check, but with MCP on the token sits in a file a cell could read.

The kernel web view now gets a website data store of its own,
`WKWebsiteDataStore(forIdentifier:)` with a fixed id, which never holds
the cookie: the server sets it only on a page loaded with the token, and
the kernel page loads without one. The page makes no API calls (its
messages go through `kernelHost`), and the server serves `kernel.html`
and the static files without a token, so nothing it needs changes. The
notebook page's service worker lives in the default store, so it never
controls the kernel page, which registers none. The store persists
rather than being `.nonPersistent()`, so modules cells import from
esm.sh stay in its disk cache across launches and load offline, as
before (review of #562).

`KernelHostTests.testTheKernelPageHasNoLoginCookie` logs a notebook
page in with the token, checks that page reads the contents API, then
starts the app's kernel and checks the kernel page gets 403 from the
contents API and can't open the kernel's websocket.
