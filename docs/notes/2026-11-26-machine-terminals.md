## 2026-11-26, Terminals in a machine's window (#858)

A machine's window has a bottom panel and File > New Terminal, but both were
gated on `Place.allows(.localTerminal)`, whose meaning was "a shell on this
Mac". The gate was right about the meaning and wrong about the panel: the
panel is the window's, and only its _first_ shell came from here. So the
capability stays what it says — this device's own server — and the question
the commands actually ask is a different one, "what does a new terminal in
this window run on", which `Place.terminalTarget(folder:remotes:)` answers:
`.local(folder:)` for this device, `.server(id, folder:)` for a machine whose
remote is still saved with a server, nil otherwise (removed, SSH only, or an
id the app doesn't know). `WindowScope.terminalTarget(notebook:remotes:)`
picks the folder: the notebook's folder when the window knows it, else the
folder the window is on, both paths on the window's own server.

`TerminalTarget.server` carries the start folder now, and it is saved with
restored windows, so the shape had to grow without breaking old JSON:
`case server(UUID, folder: String? = nil)` keeps the synthesized encoding of a
folderless target byte for byte (`{"server":{"_0":"…"}}`), which the test
asserts, and a target the old shape saved decodes with `folder: nil`. The
server resolves a relative folder against its root and falls back to the root
when it isn't there (`resolve_cwd` in ganymede-terminals), so a machine's
relative path is the right thing to hand it, and a folder that moved since the
terminal was saved still opens a shell rather than failing.

The rest was the gate's shadow. `WindowSceneValues` published `panelController`
only for this device's windows; every window has one now, and only
`windowFolder` stays this Mac's (Reveal in Finder, New Notebook's folder).
Empty panels in a window with nothing to start show the remotes' menu alone
rather than a dead New Terminal button, which is why `PanelController.show`
and `toggle` take an optional target. On iOS the same gate hid the panel
toggle, the terminal menu, the Running tab's panel rows and the panel's place,
and `IPadPanel` needed the target for its New Terminal too.

Part of #858. The by-hand checks are on #399 (Mac) and #273 (iPad and iPhone).
