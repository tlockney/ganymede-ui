## 2026-11-15, pi-ai 1.5.2 connection error text (#638)

The Dependabot npm group (#635) moved `@earendil-works/pi-ai` to 1.5.2,
which reports a blocked browser fetch as `Connection error.: Failed to
fetch` instead of a bare `Connection error.`. The agent settings' model
test matched only the bare text, so it stopped explaining that the
provider isn't running or blocks the page (CORS). The match now accepts
the appended cause too.

The pre-push review found a neighbour: Google's provider has no SDK
wrapper and passes the browser's own `Failed to fetch` on, so a blocked
Google request was never explained, before or after the bump. The match
now also takes the browser's bare fetch failures (`Failed to fetch`,
Safari's `Load failed`, Firefox's `NetworkError ...`), and a new test
blocks a request to each hosted provider.

chord 1.5.2 declares optional peers on exactly `react` 19.3.0 and `ws`
8.21.0, so npm nests the pi packages under `packages/agent/node_modules`
with those two copies. The app doesn't import `chord/react`, Vite
dedupes React, and the build bundles one React.

A provider library's error wording is worth a test wherever the UI
rewrites it.
