# Security policy

ganymede-ui is a notebook app that runs in a browser or a native shell's
web view. It runs code through the Ganymede server it connects to, or in
a Web Worker in the page. Notebook outputs can carry HTML and JavaScript,
which the app renders under JupyterLab's trust model.

## Supported versions

ganymede-ui is pre-1.0. Fixes go into the next release, and only the
latest release is supported.

## Reporting a vulnerability

Please don't open a public issue for a vulnerability. Report it
privately through GitHub:
[Report a vulnerability](https://github.com/tlockney/ganymede-ui/security/advisories/new)
(the repository's **Security** tab, then **Report a vulnerability**).

Include the version or commit, the browser, the server it was connected
to, what you expected, what happened, and the steps that reproduce it.
We aim to reply within a week.

In scope: handling of the server URL and token, rendering of untrusted
notebook output, the service worker and its cache, and the release
tooling. Problems in the Ganymede server belong to
[tlockney/ganymede](https://github.com/tlockney/ganymede/security).
