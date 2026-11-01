## 2026-11-01, New Terminal starts in the window's folder (#143)

Since #130 the Mac app's server is rooted at `/`, so a terminal created without a `cwd` started in `/`. File > New Terminal now sends the folder of the focused notebook window as `cwd`: the notebook's folder, or the folder the window shows. With no notebook window focused it uses the default folder (`AppModel.root`). The server takes an absolute `cwd` as is.

Notes:

- The window publishes its folder with `focusedSceneValue(\.windowFolder, …)`, and `TerminalCommands` reads it with `@FocusedValue`. A terminal window has no folder, so New Terminal from a terminal window starts in the default folder.
- `openWindow(value:)` brings an open window whose value is equal to the front instead of opening another one. With `TerminalTarget.local` as the value, a second New Terminal only focused the first window. Each window now gets a `TerminalRequest` with its own id.
