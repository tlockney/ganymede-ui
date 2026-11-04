## 2026-11-04, One Settings window in the Mac app (#206)

Settings (⌘,) was the Remotes list alone. The agent's settings and the
shortcut list were each reached from their own menu item. The Settings window
now has tabs: General, Remotes, Agent and Shortcuts.

- General has Make Default App for Notebooks, which was only in the
  Ganymede menu before.
- Agent and Shortcuts are the page's own sheets, so their tabs only hold
  a button that opens them in the front notebook window. Their
  observers in `WebView` now check `isMainWindow`, not `isKeyWindow`:
  while the Settings window is key, the notebook window behind it is
  still the main window. Help › Keyboard Shortcuts used to open the sheet
  in every window; now it opens only in the front one.
- The toolbar gets Save, enabled while there are unsaved edits.
- Not done from #206: a Kernels tab (the installed kernelspecs come from
  the page, and the Settings window has none), and a customizable toolbar,
  which #226 removed because AppKit crashed syncing toolbars between
  windows.
