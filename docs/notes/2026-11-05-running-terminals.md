## 2026-11-05, terminals in the Mac Running tab (#246)

The Mac navigator's Running tab listed kernels only. It now has a
Terminals section too, and the sidebar ends with a server line.

- `OpenTerminals` is an app-wide list of open terminals. Each
  `TerminalWindow` adds itself on appear, updates its title as the shell
  sets one, and removes itself on disappear. A panel terminal stays in the
  view tree while its panel is hidden, so it stays listed.
- An entry carries two closures. `reveal` selects the panel tab (if any)
  and brings the window to the front; `close` closes the panel tab, or the
  terminal's own window. The window comes from `WindowReader`, held
  weakly.
- The Running tab's badge counts kernels and terminals.
- `ServerLine`, at the foot of the sidebar, shows the backend's label and
  "N kernels, M terminals".
- The Mac app's terminals are its own (a shell through the app's server,
  or SSH), so the list comes from the app rather than from the server's
  `/api/terminals`. Terminals another client opened on the server are not
  listed.
