## 2026-11-05, Command palette (#211)

- The palette runs every entry through the same `runCommand` the Mac
  app's menus use (`window.ganymede.command`). So the palette, the native
  menus and the page commands can't drift, and a new page command only
  needs an entry in `src/lib/palette.ts`.
- Entries come from the shortcuts table, minus edit-mode-only ones
  (Complete, Show documentation, Edit cell, Leave the cell), plus the
  app's own commands, one Change Kernel per kernelspec and Recents.
  Disabled entries stay listed (greyed), so you can learn that a command
  exists before a notebook is open.
- The field stops propagation of every keydown, so the app's ⌘S (on
  `window`) doesn't see what is typed there. The notebook's handler
  listens on `document` in the capture phase, so it does see the keys,
  but it matches only when focus is inside the notebook.
- Review follow-ups: the selection resets only when the query changes,
  not on every App render (a kernel starting re-rendered App and sent ↩
  to the top entry); focus goes back where it was when the palette
  closes; ⇧⌘P does nothing while Settings, Shortcuts or Connect is open.
- The Mac app's View › Command Palette… has ⇧⌘P. The menu takes the key
  before the web view, so the page's own ⇧⌘P listener never fires there,
  and the palette opens once.
- Rename… switches the same field to a prompt, prefilled with the current
  name, instead of opening a separate dialog.
- The selection is held by entry (command and argument), not by row
  index, so Change Kernel rows arriving when kernelspecs load don't move
  it to another command. If the entry goes away or becomes disabled, the
  first one that can run is selected (review on #278).
