## 2026-11-14, remotes on the tailnet without a token (#628)

Step 5 of ganymede#816, app side. Every request the apps make to a
server (`ServerEndpoint.request` and `authorize`: kernelspecs, kernel
logs, terminals and their websockets) sends
`Ganymede-Client: Ganymede app`, and sends `Authorization` only when the
remote has a token. A Ganymede server that lets the device in by tailnet
identity then accepts a remote with no token; the in-process server's
gateway sends the same header since ganymede#820, so kernels on such a
remote work too. Other servers ignore the header.

On the Mac, the remote editor lists tailnet peers from
`tailscale status --json` (online first) and fills in
`https://<dns name>/`, where a Ganymede server shared with
`tailscale serve` answers. iOS can't read the peer list, so it keeps
typed URLs.

The gateway half needs ganymede `main` past #820; `GANYMEDE_REF` moves
there.
