## 2026-11-14, moving a terminal between the panel and a tab (#248)

A terminal in a notebook window's bottom panel and one in a tab of its own
were separate `TerminalWindow`s, each owning its transport: closing one
ended its shell. Moving now hands the running session and its SwiftTerm
view from one place to the other through `TerminalHandoff`, keyed by an id
both ends share (the panel terminal's id, or the tab's `TerminalRequest`
id).

A move marks the id as leaving and removes the terminal from its place.
`dismantleNSView` then parks the view and coordinator instead of closing
the transport, and only once it has parked does the new place open: the
panel adopts a `PanelTerminal` with that id, or a terminal window opens
with a `TerminalRequest` of that id. The new `TerminalWindow` takes the
transport, and its representable takes the parked coordinator and view, so
nothing restarts and the scrollback stays. Opening the new place before
the old view had gone would have made a second view and started the
transport again.

A parked terminal nothing takes within 10 s is closed, and a move whose
view never leaves lapses, so a failed move can't leak a shell.
`TerminalHandoff` holds the view and coordinator as `AnyObject`, so its
unit tests build without SwiftTerm. Move to Panel picks a notebook tab of
the same window first, then the frontmost notebook window, from a weak
window-to-panel map that `ContentView` fills.
