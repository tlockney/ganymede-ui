## 2026-10-19, customizable keyboard shortcuts (#50)

The shortcuts sheet edits the table it lists: + records one keystroke to
add, × removes a binding, Reset (per row, or Reset All) restores the
defaults. Overrides replace a command's whole list of bindings and live
in local storage (`ganymede-ui:shortcuts`), so per origin; the Apple apps
keep theirs because they reuse the server's port. `bindShortcuts` binds a
Lumino `CommandRegistry` from the table and rebinds on every change, so
open notebooks pick up a change at once; the App's Save reads the table
on each keydown.

Two checks before a keystroke is added: outside command mode a binding
needs ⌘, ⌃ or ⌥ unless it is a named key (Enter, Tab, an arrow), since
Shift+letter still types; and it can't repeat a binding of a shortcut
that can fire on the same keydown (command and edit mode never do).
Recording takes a single keystroke, not a sequence like D D, and Escape
cancels it rather than being recorded. Recorded keys are stored as Lumino
normalizes them for the platform (Cmd on a Mac), not as Accel.

In jsdom, user-event leaves `keyCode` out, and Lumino's keyboard layout
reads it, so the sheet's tests fire keydowns with `keyCode` set.
