## 2026-11-03, Command bridge for native chrome (#205)

Thomas chose native SwiftUI chrome for the apps (#199): the sidebar,
toolbar and menus move to SwiftUI, and the web view shows the notebook.
This PR is the page's half and the plumbing; no app window uses
`chrome=native` yet, so nothing changes on screen until #206.

- `chrome=native` stays in the URL (unlike `kernels` and `token`), so a
  reload or WebKit restarting the page keeps the layout.
- Setting `--toolbar-h: 0px` on the window collapses every offset the page
  keeps for its own toolbar (notebook padding, the find bar, notices) in
  one place.
- The notebook's `CommandRegistry` already holds every command in the
  shortcuts table, so the controller's `command(id)` forwards to it, and
  native menus get move, cut, undo, the cell types and the rest without a
  second list. Commands that need app state (open, new notebook, sheets)
  are handled in `App`.
- `runCommand` lives in a ref that each render replaces, so
  `window.ganymede` is set once and still acts on the current notebook.
- On the Swift side the command script JSON-encodes its arguments, so a
  path with quotes or backslashes can't break out of the string.
  `evaluateJavaScript` can't return the page's promise; callers that need
  the answer can use `callAsyncJavaScript`, as save does.
