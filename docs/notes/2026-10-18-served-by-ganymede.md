## 2026-10-18, served by Ganymede (#31)

`ganymede serve --static-dir dist` already served the built app at `/`
(any static dir that isn't JupyterLab's is the fallback behind the API),
but the app opened on the Connect sheet. Opening the printed `?token=` URL,
the server answers with a login cookie and a redirect to `/` without the
token, so by the time the app runs there is no token to read.

- With no token and no saved backend, the app now asks this page's server
  for `/api/status` on its cookie first (`signedInHere`), and connects
  with an empty token when that succeeds. The sheet waits for the answer,
  so it doesn't flash. Under `npm run dev` without a token the proxy gets
  403 and the sheet opens as before.
- With an empty token, `@jupyterlab/services` sends `X-XSRFToken` from
  the `_xsrf` cookie, which Ganymede's API needs on cookie-authenticated
  requests that change state. Ganymede 0.2.0 sets that cookie only with
  JupyterLab's page, so saves and kernel starts got 403;
  tlockney/ganymede#140 sets it with any static dir's pages.
- Checked by hand against a build of that branch: open the token URL, open
  a notebook, run a cell, save; the output is in the file. The e2e suite
  pins Ganymede 0.2.0, so a served-by-Ganymede e2e test waits for the
  release that carries #140.
