## 2026-11-01, SSH terminals on the Mac (#121)

File > New Terminal On now lists each remote twice when it has both a server and SSH: "(Server)" opens a Jupyter terminal on the server, "(SSH)" runs `/usr/bin/ssh` in a pseudo-terminal the app spawns. Using the system ssh rather than an SSH library means `~/.ssh/config` aliases, the agent (including 1Password's or Secretive's), ProxyJump, and the known_hosts prompt all behave as in Terminal.app, with nothing for the app to store.

Notes:

- `ProcessTerminalTransport` is SwiftTerm's `LocalProcess` behind the app's `TerminalTransport`. Its delegate is held weakly, so the transport keeps it. Data arrives on the main queue, but the exit doesn't have to, so the exit hops to the main queue.
- The arguments are `[-p port] [-l user] -- host`. `--` stops a host that starts with `-` from being read as an option.
- An exit status other than 0 is shown in the window ("ssh ended with status 255."). Wording stays neutral: ssh exits with the remote shell's status, so a non-zero status after `exit` is normal. A missing program is checked before starting, since LocalProcess reports a failed exec as 127, the same as a shell's "command not found".
- The iPad side of #121 (Citadel, keys in the keychain, a terminal scene and key row) is a separate PR.
