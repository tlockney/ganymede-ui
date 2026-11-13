## 2026-11-13, Shortcuts kept per name (#587)

From the 2026-11-13 security read (ganymede#746, finding 5). The ledger
keyed `shortcuts.run` by `(notebook, "shortcuts")`, so "Always" let a
notebook run every Shortcut, with any input, after one prompt.

- `DeviceBridge.setLedgerCapability(_:_:)` lets a method key its ledger
  answers by something narrower than its namespace. `shortcuts.run` keys
  by `shortcuts:<name>` (`shortcutCapability`, `shortcutName`).
- A kept "deny" for the namespace still refuses every call; a kept
  "always" for it lets none through, so answers kept before this change
  ask again per Shortcut.
- The prompt reads "“Journal.ipynb” wants to run the Shortcut “Log Day”",
  and Settings › Device lists each Shortcut on its own row with Revoke.
- Since a call's prompt asks about one Shortcut, it has a fourth option,
  "Don’t Allow Any Shortcuts", which keeps a deny for `shortcuts`.
  `shortcuts.requestAuthorization` and the prompt at open for a declared
  `shortcuts` would keep an "always" that grants nothing, so the first
  answers without asking and the second skips it
  (`DeviceBridge.narrowedNamespaces`).
