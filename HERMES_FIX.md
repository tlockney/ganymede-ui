# Fix brief: review of #858 (terminals in a machine's window)

Branch `claude/project-thread-fneunc` (head 8056c08 + this file). Fix
every item below, keep the repo's comment style (`///`, say why, cite
`(#858)`), delete this file in your commit, commit once, do not push.

## Medium

1. Kernel Log tab in a machine's window asks THIS Mac's server for the
   machine's kernel log (`BottomPanel.swift` ~104, `ContentView.swift`
   ~752-760: `KernelLogView(... server: model.serverURL)`), so it shows
   "The server no longer has this kernel's log." Fix: `BottomPanel` gets
   `kernelLog: Bool` (true only for `place.isThisDevice`); when false the
   header has no Kernel Log tab and `KernelLogView` is never built. The
   kernel popover's Kernel Log stays dimmed in a machine's window, as now.
2. Tests for the folder choice and the cwd wiring:
   - Move the rule "start folder = parent of the open notebook, else the
     window's folder, empty → nil (root)" into one function in
     `Place.swift`, OUTSIDE any `#if os(macOS)`, e.g.
     `func terminalTarget(notebook: String?, fallbackFolder: ..., remotes: [Remote]) -> TerminalTarget?`.
     Make `WindowScope.terminalTarget` (FocusedModels.swift) and the iOS
     copy (`ContentView.swift` ~932-936) both call it; delete the iOS copy.
   - For this device, keep the old behaviour exactly: a window on `/`
     (serverFolder `""`) must start where it did before this branch
     (check `origin/main`'s `TerminalCommands`: `folder ?? model.root`
     with the window's `windowFolder`); don't turn `/` into `model.root`.
   - PlaceTests: machine notebook `"a/b/nb.ipynb"` → `.server(id, folder: "a/b")`;
     nil notebook with fallback `"x"` → folder `"x"`; top-level notebook
     `"nb.ipynb"` → folder nil; this device → the right `.local` URL.
   - cwd: make `makeTransport`'s `.server` branch testable (e.g. a static
     `func transport(for: TerminalTarget, ...)` or assert in
     `JupyterTerminalTransportTests` that a transport built for
     `.server(id, folder: "notes")` sends `"cwd": "notes"` in the create
     body). It must fail if `cwd: folder` is removed.
3. docs/apps.md: the new sentences at ~213-217 (Mac "Terminals and the
   kernel log") and ~780-781 (iOS "Terminals" in "On both") need the
   standard note next to them:
   ```
   > [!NOTE]
   > **Unreleased.** Available only from a build of `main` (HEAD), not in
   > the latest release.
   ```
   (or move both sentences into the Machines section, which has one).
   Drop "Its running kernels are where they run, as on this device."
   In the Machines note, say the latest release has "no terminal panel or
   New Terminal" in a machine's window (New Terminal On already works).
   Say the Kernel Log tab is this device's only.
4. Dev log `docs/notes/2026-11-26-machine-terminals.md` ~29-30 says empty
   panels show only the remotes' menu; the code shows a dimmed New
   Terminal. Make the text match the code (keep the dimmed button).

## Low

5. `ContentView.swift`: show the toolbar's panel toggle for every window
   (the panel exists even when the machine's remote is gone, and ⌃`
   shows it), and pass `panel` to `NavigatorSidebar` for every window
   (~627) so its "New Terminal On" foot shows in a machine's window. Keep
   `NotebookToolbar`'s `panel: place.isThisDevice ? panel : nil` (~115)
   since Kernel Log stays this-device only; say so in a comment.
6. Edit your by-hand check comments to match the code (use
   `gh api -X PATCH repos/tlockney/ganymede-ui/issues/comments/<id> -f body=...`,
   keeping the footer): #399 is issuecomment-7191666038, #273 is
   issuecomment-7191666569.
   - A removed or SSH-only machine: the panel and + menu show a dimmed
     New Terminal (not "only the remotes' terminals").
   - A restored terminal keeps its saved folder; a restored panel starts
     in the open notebook's folder (not "at the machine's root").
   - Add: in a machine's window the panel has no Kernel Log tab.

## Checks before you commit

`npm run check`; in `apple/`: `xcodegen` if project.yml changed, macOS
unit tests, iOS build. Report counts.
