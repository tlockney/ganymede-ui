## 2026-10-20, token out of localStorage (#55)

The saved connection kept the server token in `localStorage`, where it
outlived the tab and any script on the origin, a trusted notebook's
outputs included, could read it. `saveConfig` now writes the connection
without its token to `localStorage` and the token to `sessionStorage`
(`ganymede-ui:token`), which ends with the tab. `loadConfig` drops a
token an older version saved. Script on the origin can still read
`sessionStorage` while the tab is open; sandboxed outputs (#35) close
that.

After a browser restart a remote server's connection loads with an empty
token, and connecting fails with "The server refused the token" in the
sheet, URL filled in. Same-origin use is unaffected: served by Ganymede,
the app connects on the login cookie.

`initialConfig` (#60), the `useState` initializer, used to strip `?token=` and
`?kernels=` from the URL while rendering. It now only reads them, and an
effect strips them. React 19's StrictMode keeps the first initializer
result, so the double call #60 describes didn't lose the token here; a
StrictMode test pins it anyway.
