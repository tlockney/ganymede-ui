## 2026-10-19, keyboard shortcuts sheet (#49)

Every shortcut now comes from one table, `src/lib/shortcuts.ts`: command
id, label, group and Lumino key sequences. `createCommands` and
`attachEditing` bind from it (where a binding applies, edit or command
mode, stays in their selectors), App's ⌘S matches a keydown against it
with Lumino's `keystrokeForKeydownEvent`, and the sheet lists it, so a
binding can't be listed without being bound. The sheet opens from the
toolbar's keyboard button, from H in command mode (Jupyter's classic
notebook key for it), and from Help > Keyboard Shortcuts in the Mac app,
which runs `window.dispatchEvent(new Event('ganymede:show-shortcuts'))`
in the web view. Lumino's `formatKeystroke` writes ⇧⏎ on a Mac and
Shift+Enter elsewhere. Completer Enter, tooltip and find-bar Escape stay
out of the table: they only act while their popup is open.
