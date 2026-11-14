## 2026-11-14, remotes on the tailnet without a token (#628)

Step 5 of ganymede#816, app side. Every request the apps build through
`ServerEndpoint.request` and `authorize` sends
`Ganymede-Client: Ganymede app`, and sends `Authorization` only when the
server has a token. Of these, only terminals and their websockets go to
a remote; kernelspecs and kernel logs go to the in-process server. A Ganymede server that lets the device in by tailnet
identity then accepts a remote with no token; the in-process server's
gateway sends the same header since ganymede#820, so kernels on such a
remote work too. Other servers ignore the header.

On the Mac, the remote editor lists tailnet peers from
`tailscale status --json` (online first; Mullvad exit nodes left out)
and fills in `https://<dns name>/`, where a Ganymede server shared with
`tailscale serve` answers. It names a device by the first label of its
DNS name, not `HostName`, which is `localhost` on iPhones and iPads.
Picking another host clears the token, so one server's token never goes
to another, and a second pick renames a remote the first pick named. iOS can't read the peer list, so it keeps
typed URLs.

The gateway half needs ganymede `main` past #820; `GANYMEDE_REF` moves
there.
