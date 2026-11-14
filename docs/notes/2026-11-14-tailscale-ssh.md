## 2026-11-14, Tailscale SSH on iPad and iPhone (#630)

Step 6 of ganymede#816. Tailscale SSH signs a tailnet device in by its
tailnet identity: it accepts the SSH `none` method, and in check mode it
first sends a banner with a login URL and holds the sign-in until the
person approves it in a browser. The iOS client (swift-nio-ssh) offered
only the app's key, and dropped banners.

`SSHSignIn` (Foundation only, so the Mac tests run it) holds the logic:
`next` offers `none`, then the key once if the server takes keys, as
OpenSSH's client does; `banner` turns a banner into terminal bytes,
dropping C0/C1 control characters (a banner could otherwise move the
cursor or change the terminal), ending lines in CRLF and wrapping http(s)
links in OSC 8, which `TerminalCoordinator.requestOpenLink` opens.

In the transport, `ShowBanners` catches `NIOUserAuthBannerEvent` from
`NIOSSHHandler` and writes it to the terminal. The 30-second sign-in limit
becomes 5 minutes once a banner has arrived: the timer checks on firing
and re-arms for the rest.

An OpenSSH server refuses `none` and lists its methods, so the key path is
unchanged apart from one extra round trip. Not tried on a real tailnet:
the by-hand check goes on ui#273.
