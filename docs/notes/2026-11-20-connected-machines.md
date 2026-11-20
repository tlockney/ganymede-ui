## 2026-11-20, connected machines design note (#699)

Thomas wants the apps to be Juno and Juno Connect in one: this device's
notebooks and another machine's files, live notebooks and kernels in the
same app, on Mac, iPad and iPhone (#697). Today a remote only lends
kernels and terminals to this device (`gateway_url`), and notebooks
always come from the app's own server, so the apps can't open a room on
another machine. A browser pointed at that machine's server can.

`docs/design/connected-machines.md` is kept out of the published
`docs/*.md`, since nothing in it is built and an `Unreleased.` note there
would be removed at the next release. It picks a forwarder in the
embedded server (`/machines/{id}/`) over the page connecting
cross-origin: a loopback origin in a machine's `allow_origins` would
trust any page on that port on any device and leave the token in the page
(the embedded server keeps its port across launches but falls back when
it's taken), `[tailscale] allow` refuses cross-origin pages, and tokens
stay native. Loading the machine's own web UI was ruled out for version
skew and because the native bridge must not reach a page from another
machine.

Review asked for the mount's boundary, now in the note: only the app's
own page sessions, never tailnet identities or `/mcp`; local credentials
stripped before forwarding; an allowlist of routes; its own sandbox CSP
on `files`; the bridge keyed to the window, not the origin; path-keyed
state keyed by place.

Thomas's calls the same day: mobile is part of done; plain notebooks, not
only journals; not tailnet-only (pairing, synced list, relay later); an
unreachable machine's notebooks go read-only, no offline editing; Run
Kernels On stays, moved into the kernel picker.

The PR review added two more: the sandbox CSP goes on every forwarded
response (`nbconvert/html` returns the machine's HTML too), and
`Set-Cookie` is dropped, since the machine sets its login cookie on token
requests.
