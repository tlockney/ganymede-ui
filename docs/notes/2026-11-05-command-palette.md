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
- The field stops propagation of every keydown, so neither the notebook's
  bindings nor the app's ⌘S see what is typed there.
- The Mac app's View › Command Palette… has ⇧⌘P. The menu takes the key
  before the web view, so the page's own ⇧⌘P listener never fires there,
  and the palette opens once.
- Rename… switches the same field to a prompt, prefilled with the current
  name, instead of opening a separate dialog.
