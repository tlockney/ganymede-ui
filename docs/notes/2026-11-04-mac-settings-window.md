## 2026-11-04, One Settings window in the Mac app (#206)

Settings (⌘,) was the Remotes list alone. The agent's settings and the
shortcut list were each reached from their own menu item. The Settings window
now has tabs: General, Remotes, Agent and Shortcuts.

- General has Make Default App for Notebooks, which was only in the
  Ganymede menu before.
- Agent and Shortcuts are the page's own sheets, so their tabs only hold
  a button that opens them in the front notebook window. Neither key nor
  main window works to pick that window: a titled Settings window becomes
  both. `NotebookWindows` keeps every notebook page's web view, finds the
  frontmost of their windows in `NSApp.orderedWindows`, brings it forward
  and names it as the notification's object, and only that window's
  observer acts. The buttons are off with no notebook window open.
  Help › Keyboard Shortcuts and Agent Settings… go the same way, so they
  work with a Terminal or Editor window in front; before, Keyboard
  Shortcuts opened the sheet in every window.
- The toolbar gets Save, which saves and is enabled as File › Save is
  (the window has a file).
- Not done from #206: a Kernels tab (the installed kernelspecs come from
  the page, and the Settings window has none), and a customizable toolbar,
  which #226 removed because AppKit crashed syncing toolbars between
  windows.
