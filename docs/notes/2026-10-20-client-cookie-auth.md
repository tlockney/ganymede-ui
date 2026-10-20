## 2026-10-20, cookie auth in packages/client (#64)

`RestClient` authenticated only with the `Authorization: token` header,
so against a server on its login cookie, as when Ganymede serves the
app, every write would get 403. Settings now carry `credentials`
(`'same-origin'` by default, passed to `fetch`) and `xsrfToken`, which
by default reads the page's `_xsrf` cookie when `baseUrl` is the page's
origin; writes send it as `X-XSRFToken`, as `@jupyterlab/services` does.
The cookie belongs to the page's origin, so it isn't sent to other
servers; a caller with a cross-origin cookie session passes its own
`xsrfToken`.
