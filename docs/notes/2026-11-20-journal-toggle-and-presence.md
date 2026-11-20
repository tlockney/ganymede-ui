## 2026-11-20, Journal toggle in the apps, and who sees a note (#724)

In 0.14.0, the Mac app had no way back to the journal after Open as
Notebook, except the Command Palette. The page's toolbar button sits under
the app's native chrome, and the page didn't report which view showed. The
page now posts `journal` in its state. The Mac toolbar and View menu, and
the iPad/iPhone notebook menu, show View as Journal or Open as Notebook to
match.

The journal's status line listed only the room's awareness. An agent
holds its room on the server, so it never showed: "Only you are here"
appeared even while Claude was writing. The view now polls the server's
rooms list (ganymede#893, the same one the machine Journals tab uses) for
its path. It adds the agents to the status line, and puts a line by the
composer naming them, or saying none is in the room. A request is saved
in the notebook either way, and `ganymede mcp watch` reports it to an
agent watching the folder while the notebook stays open (the person's
journal keeps the room open). The Mac toolbar's Run, Insert and Cell Type
are now off while the journal shows.
