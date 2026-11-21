# Connected machines

> [!NOTE]
> Design note: not built yet. Tracked in
> [#697](https://github.com/tlockney/ganymede-ui/issues/697).

The apps should be one app that works on this device's notebooks and on
another machine's, side by side, as Juno and Juno Connect would be if they
were one app. A **connected machine** is another computer running
`ganymede serve`: the Mac mini, a laptop, a cloud box where an agent keeps
a journal. Connecting brings its files, its live notebooks (rooms) and its
kernels into the app's windows on Mac, iPad and iPhone.

This replaces "remotes" as the main way to use another machine. Today a
remote lends its kernels to this device's notebooks (`gateway_url`), opens
terminals on its server, and opens SSH shells; notebooks always come from
the app's own server. Under places:

- Run Kernels On stays, as an advanced choice in the kernel picker.
- A machine's terminals open from its place (Running, New Terminal).
- An SSH-only remote (no server) stays in Settings > Remotes for shells;
  it isn't a place, since it has no files or rooms to show.

The web build already connects to another server directly (Connect, with
the server's `--allow-origin`). The apps don't reuse that, for the
reasons under "How the app reaches a machine".

## What you see

- The app's native menus switch places: This Mac (or On My iPad) and
  each connected machine, with a dot for reachable or offline. The
  sidebar shows the open place's name and dot, and under it the same tabs
  for every place: Files, Journals, Running, Search. The page has no
  place list of its own (#773).
- A notebook opened from a machine opens live in that machine's room and
  runs on that machine's kernels. Its tab or title names the machine.
  Windows are independent: one can show the Mac mini while another shows
  this Mac.
- When a machine stops answering, its open notebooks turn read-only with
  "Reconnecting…" and become editable again when it's back. There is no
  offline editing.
- Journals lists the notebooks an agent is in on each place, with who is
  there and when it last wrote. The journal view decisions are on #697.

## How the app reaches a machine

The page in a window only talks to its own origin, the app's embedded
server. The embedded server **mounts** each connected machine under
`/machines/{id}/` and forwards an allowlist of routes below that path,
HTTP and websocket, to the machine's server:

- `api/status`, `api/me`, `api/contents`, `files`
- `api/collaboration` and `api/fileid` (rooms)
- `api/kernels` and their channels, `api/sessions`, `api/kernelspecs`
- `api/terminals`
- `api/notebooks/run` (Run with Parameters)
- `api/metrics/v1/kernel_usage`, `api/events/subscribe`
- `nbconvert` (Export and Publish)

Never forwarded: `mcp`, `api/host/*` (grants), and anything not listed.
A window on a machine gets the page with that prefix as its server, so
the web layer makes no cross-origin requests and the JupyterLab services
it uses work unchanged.

Why the embedded server, and not the page connecting to the machine
directly:

- **Credentials stay native.** The machine's token, or the tailnet
  identity, is added by the forwarder and never handed to the page.
- **CORS doesn't fit.** The embedded server keeps its port across
  launches, but falls back to another when that one is taken, and the
  origin differs on each device. Listing a loopback origin in a machine's
  `allow_origins` would trust any page served from that port on any
  device, and CORS still leaves the token in the page.
- **Tailnet identity works.** `[tailscale] allow` refuses a cross-origin
  page by design. The forwarder is a program on this device, sending
  `Ganymede-Client` as the kernel gateway already does (ganymede#820).
- **One code path on Mac, iPad and iPhone.** The embedded server runs
  in-process on all three.

Loading the web page from the machine itself was ruled out: the machine's
UI build can differ from the app's, and the app's native bridge (device
APIs, Keychain, Shortcuts) must never be offered to a page from another
machine.

The forwarder belongs in Ganymede's server (a mount beside the kernel
gateway in `ganymede-gateway`), with new C functions beside
`ganymede_server_start` to add and remove a machine at run time. Ganymede
stays language-free and the apps stay API clients.

### Who may use the mount

The forwarder attaches the machine's credential, so the mount must serve
only the app's own windows:

- Only requests carrying the app's own page session (its cookie, or its
  token from loopback). Never a tailnet identity, so a login allowed by
  the Mac's tailnet sharing gets nothing on the machine, and never `/mcp`
  or the MCP token, so a local agent can't reach the machine through it.
  Agents use the machine's own server.
- Before forwarding, it strips the page's `Cookie`, `Origin`, `_xsrf` and
  the local token, so no local credential reaches the machine (and the
  machine's tailnet `same_origin` check passes).
- On every forwarded HTTP response it sets its own sandbox CSP, whatever
  the machine sent: the one Ganymede sends for `nbconvert` on
  `nbconvert/html`, the one for `/files` on everything else. A machine's
  HTML (a file, an export, an error page) lands on the app's origin, and
  the machine may run an older or another Jupyter server.
- It forwards only an allowlist of response headers and drops
  `Set-Cookie`, so the machine's login or `_xsrf` cookie never reaches
  the WebView's cookie store.
- Off unless the person links a machine. No machine is linked by default.

### What a machine window doesn't get

The device bridge, the host API grants sheet, Notebook Access, Shortcuts
and link handling act on this device only. A machine window and a local
one share the page's origin, so the bridge can't decide by origin, as
`AgentKeys` does today: the native side keys it to the window, and a
machine window's web view gets none of those handlers. Kernels on the
machine do not get `device` (the machine's own apps decide that). Run
with Parameters, Publish and Export work through the machine's API.

State keyed by path (the page's saved state in local storage, Recents,
File > Open Recent, Spotlight) is keyed by place too, so `notes/a.ipynb`
on this Mac and on the mini stay apart.

## Linking a machine

A machine is reached one of several ways, and the list must not assume
any single one:

| Transport    | Today                                                 | Credential                   |
| ------------ | ----------------------------------------------------- | ---------------------------- |
| Tailnet      | Tailnet remotes and the Mac's peer picker (ui#629)    | Tailnet identity, or a token |
| URL          | Saved remotes with a token                            | Token, in the Keychain       |
| Same network | Not yet: Bonjour adverts from `ganymede serve` (#474) | Token or pairing             |
| Relay        | Not yet: for machines behind NAT, such as a cloud box | Pairing                      |

The first steps use what exists: tailnet and URL. Later, still to be
designed:

- **Pairing.** Linking once, by a QR code or a short code shown by the
  machine, gives this device its own credential that the machine can
  revoke on its own, instead of a shared server token.
- **A synced list.** Machines linked on one device appear on the others
  (iCloud key-value store for the list; credentials stay per device).
- **A relay** for machines that can't be reached directly.

## Server work

- **The mount** (above), with the machine's credential and transport,
  set and removed at run time.
- **A list of open rooms**, `GET /api/collaboration/rooms`: each room's
  path, who is in it (the names in the room's awareness, and MCP clients,
  marked as agents), and when and by whom it last changed. Journals and
  the place's Running tab read it. Today a room can only be joined, not
  listed.

## Steps

1. Ganymede: list open rooms with presence and last change.
2. Ganymede: mount a machine under `/machines/{id}/`, with the C
   functions to add and remove one, and the rules under "Who may use the
   mount".
3. Apps: machines in the native place menus, a window per place, files and
   live notebooks from a machine, read-only while it's unreachable,
   path-keyed state per place, the bridge off in machine windows; Run
   Kernels On moves into the kernel picker. Mac, iPad and iPhone.
4. Journals tab from the rooms list.
5. The journal view (#184), then requests and notifications (#697).
6. Pairing, the synced list, Bonjour, the relay: design first.
