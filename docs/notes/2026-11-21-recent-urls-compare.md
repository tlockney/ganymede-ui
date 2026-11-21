## 2026-11-21, Recent URLs compare the same way they are stored (#733)

Follow-up to #732's review. Stored recent URLs have no query or fragment,
but `RecentHosts.excluding` and the token clearing in the Tailnet Device
and Recent menus compared the field as typed. With
`http://host:8888/?token=abc` in the field, the Recent menu still offered
`http://host:8888/`, and picking it cleared the token for the same server.
`https://a.ts.net` and `https://a.ts.net/` were also two entries.

- `RecentHosts.normalized` trims, drops the query, fragment and any
  `user:password@`, lowercases the scheme and host, and ends the path in
  `/` (as `ServerEndpoint` does) for a URL with a scheme and a host; other
  strings are only trimmed. `sameServer` compares two URLs through it.
- `adding` stores the normalized form and merges an older entry that
  normalizes to the same URL. `excluding` uses `sameServer`, and both menus
  set the token through `tokenAfterPicking`, which keeps it for the same
  server and clears it for another.
- `load` returns the stored list normalized and without repeats, so
  entries an older build stored (with credentials, or one server twice)
  are cleaned too. An IPv6 host is left in its own case.
- The Mac line of #731's by-hand check moved from #273 to #399, with
  by-hand checks for the menus' token rule, which unit tests can't reach.

Tests (`RecentHostsTests`): `excluding` with a query and a fragment, the
empty path in `adding` and `excluding`, `/lab` and `/lab/` as one entry,
credentials dropped and case folded, `sameServer` true and false cases,
`tokenAfterPicking` for the same and another server, an IPv6 host, `load`
cleaning an older list, and a non-URL only trimmed.

Checks: `npm run check`, `npm test`, `npm run build`. Swift can't build in
the container; CI's macos-app job is the first compile.
