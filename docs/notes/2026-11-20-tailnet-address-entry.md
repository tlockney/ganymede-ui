## 2026-11-20, tailnet address entry on iPhone and iPad (#731)

The remote form didn't say how to enter a tailnet address on iOS, where
there is no Tailnet Device picker (the app can't run the tailscale CLI).

- On iOS the URL placeholder is `https://host.tailnet.ts.net/`, and the
  footer says to enter the device's address with the Tailscale app
  connected, where to find the name, and that a Mac shares Ganymede there
  with Settings › General › Tailnet on. The Mac keeps its placeholder.
- A **Recent** menu under the URL field (both platforms) lists the server
  URLs saved before: most recent first, no repeats, at most 8, without the
  one in the field. Picking one clears the token if the URL changes, as the
  Mac picker does. `RemoteEditor.save()` records the trimmed URL in
  UserDefaults (`recentServerURLs`), without any query or fragment so a
  pasted `?token=` isn't kept; the list logic is `RecentHosts`.
- `docs/apps.md` ("Remotes on your tailnet") has the iPhone and iPad steps,
  and says iOS blocks an `http://name.tailnet.ts.net:port` address, so a
  server on its own port needs the tailnet IP or short name.

Checks: `npm run check`; `RecentHostsTests` covers adding, dedupe, trimming,
empty, the cap, query stripping and `record`/`load`. CI builds the Swift.
By-hand checks on ui#273.
