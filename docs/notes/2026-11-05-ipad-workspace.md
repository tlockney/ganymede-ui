## 2026-11-05, iPad workspace: navigator tabs, files over the notebook, bottom panel (#251)

- The iPad's sidebar has the Mac's navigator tabs, so `NavigatorTab`
  moved out of the macOS-only `NavigatorSidebar.swift` into its own
  file. The iPhone keeps one list with everything, since its sidebar is
  the whole screen. The tab strip's buttons are 44 points tall.
- Text files open over the notebook in the detail column's
  `NavigationStack`, not in a scene of their own. The notebook is the
  stack's root, so its web view (and the page's kernel) stays loaded
  under them. The editor's back button is hidden: Close asks to save,
  and a back swipe would drop edits without asking. To make going back
  to the notebook safe anyway, `IPadOpenFiles` keeps each file's
  `EditorDocument` until it is closed and saves dirty ones on the way;
  `EditorWindow` loads a document only once, so a kept one shows its
  edits again. The stack logic is `FileStack`, with tests.
- The bottom panel reuses the Mac's `PanelController`. Its view is
  iOS-only (`IPadPanel.swift`): a sheet-style grabber instead of a
  resize cursor, close buttons always shown (no hover), 44-point header
  buttons, and remotes only in the + menu, since iOS has no local
  shell. Terminals were scenes of their own; they now go to the panel.
- Fill the Screen is state in `ContentView`, not the panel: the sidebar
  goes to `.detailOnly` and the panel is hidden from view but kept in
  the tree. Rotating to landscape no longer brings the sidebar back
  while the screen is filled.
- ⌃` (View › Show/Hide Terminal Panel) goes through a focused scene
  value carrying the toggle, since whether the panel is on screen also
  depends on Fill the Screen.
- Not done here: the inspector (Agent, Outline, Variables) waits with
  the Mac's #249; the kernel log in the panel waits on ganymede#365, as
  on the Mac. Device checks are in #273.
- From PR #274's review: the ⋯ menu's Rename passes any non-empty name
  to the page, whose `renamedPath` rejects a `/` with a notice, as it
  does `\` and a leading `.`; before, the app dropped `/` silently.
- From PR #277's review: hiding the panel or switching its tabs only
  changed opacity and hit testing, so a terminal that had the keyboard
  kept it. The iOS `TerminalRepresentable` now honours `focused` as the
  Mac's does (`becomeFirstResponder`/`resignFirstResponder`), and the
  panel passes `selected && shown`. Also: a text file's screen keeps the
  terminal, panel and fill buttons; the panel stops filling once its
  last terminal closes, however it closed; and kept documents with
  edits but no screen are saved when the app goes to the background.
