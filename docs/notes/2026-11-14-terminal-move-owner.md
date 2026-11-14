## 2026-11-14, Terminal move: unregister by place (#248)

After #609 merged, a review found that `TerminalHandoff.unregister`
checked the transport, which a moved terminal keeps. A late
`onDisappear` from the old place could then unlist the terminal in its
new place, and it couldn't move again until its title changed. Each
place now registers with its own owner id (the `TerminalWindow`'s
`OpenTerminals` entry), and only that owner unregisters it.

Move to Panel now beeps when the move is refused, as Move to Tab does.
