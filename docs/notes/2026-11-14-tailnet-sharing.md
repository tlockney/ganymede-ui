## 2026-11-14, sharing the Mac app's server on the tailnet (#626)

Step 4 of ganymede#816. Settings › General › Tailnet lists the logins
let in without the token and turns sharing on. The app then:

- finds the `tailscale` command (the Tailscale app's own, else Homebrew's
  or /usr/local's), and reads this Mac's MagicDNS name from
  `tailscale status --json`;
- starts its server with that name in `local_hostnames`,
  `trust_xheaders`, and `[tailscale] allow` set to the list (Ganymede's
  mode A: the server believes `Tailscale-User-Login` only from
  loopback, only from its own pages);
- runs `tailscale serve --bg --https=443 http://127.0.0.1:<port>`, unless
  443 already proxies somewhere the app didn't set. It remembers the port
  it served, so turning sharing off removes only its own handler.

Sharing needs at least one login: the page's token is random per launch
and not shown, so sharing without a list would let no one in. Mode B
(`whois` on the tailnet address) stays a `ganymede serve` feature: a
browser on another device needs mode A's HTTPS, and the app's own page
talks to loopback.

`GANYMEDE_REF` moves to a ganymede `main` commit that has `[tailscale]`
(ganymede#819), since the server refuses unknown config keys; the next
ui release waits for a Ganymede release, as `scripts/release-pins.sh`
checks. Not yet tried with a real tailnet: by-hand check in #399.
