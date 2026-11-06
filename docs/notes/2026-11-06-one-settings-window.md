## 2026-11-06, One Settings window (#332)

Thomas found the Mac Settings window shrunk to one row of each tab, its
Agent tab opening a second dialog also titled "Settings", the keyboard
shortcuts in a dialog of their own, and the picker for where kernels run
hard to find.

The window set a width and no height, and a grouped `Form` scrolls, so it
has no height of its own: each tab collapsed to its first row. It now has
one fixed size.

Every settings surface before this change:

- Mac ⌘,: General, Remotes (with the "Run kernels on" picker), Kernels
  (which pointed at Remotes), Agent and Shortcuts (buttons that opened the
  page's sheets in the front notebook window).
- Ganymede › Agent Settings… and Help › Keyboard Shortcuts: the page's
  sheets.
- The page's command palette: Settings…, Keyboard Shortcuts and Connect to
  a Server…, each its own web sheet; `H` in command mode, the shortcuts
  sheet.
- iPad and iPhone: one Settings screen, whose Keyboard Shortcuts closed it
  and then opened the page's sheet.

Now:

- The Mac window's tabs are General, Kernels (the picker and the installed
  kernels), Remotes, Agent and Shortcuts. Agent is the native form the iPad
  already had (`AgentSettingsView`, now built for both), talking to the
  front notebook window's page, which keeps the settings in local storage
  shared by every window.
- Shortcuts are the page's own list, loaded alone with `view=shortcuts`
  from the app's server. The rebinding UI stays in one place (the web), and
  the page is the notebook windows' origin, so they pick up a change
  through the `storage` event, which `shortcuts.ts` now listens for. A
  native list would have meant converting AppKit key events into Lumino
  keystrokes.
- The page posts a `settings` message naming a tab where it would open a
  sheet; the Mac opens Settings there (`SettingsOpener`), the iPad and
  iPhone open their Settings screen and push Agent or Keyboard Shortcuts.
  In a browser there is no handler and the sheets show as before.
- macOS 14 opens the Settings scene only through SwiftUI's `openSettings`,
  which only a view can read, so each window keeps it for the menus and the
  pages; macOS 13 uses the `showSettingsWindow:` action.
- Kernel › Where Kernels Run… opens Settings › Kernels.
