## 2026-10-19, service-worker relay diagram (#88)

`docs/images/sw-relay.svg` is a sequence diagram of the relay, added to the
"Service-worker relay" section of `docs/architecture.md`. It is hand-written
in the style of `backends.svg`, with the same classes and dark colors, and
was checked in Chromium in both color schemes.

It follows the code rather than the issue's wording in one place: the
service worker doesn't tag requests with `browsingContextId`. The kernel
puts it in the request body (`globalThis.jupyterlite`, set in `lite.ts`);
the relay adds `requestId` and `pathname` and matches the reply on
`browsingContextId` and `requestId`. The section's prose now says so.
