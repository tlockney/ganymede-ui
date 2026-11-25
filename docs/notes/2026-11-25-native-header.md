## 2026-11-25, Native notebook header (#812)

Step 2 of #800: the browser's header model (#806, option A of the
mockups) in the Mac, iPad and iPhone chrome.

- **The status line.** `HeaderStatus.swift` (both platforms, Foundation
  only) is a port of `src/lib/header-status.ts`: `save`, `runs`,
  `kernelText`, `stateText`, `full` and the iPhone's `short`, with the
  browser's words and a test for each of `header-status.test.ts`'s cases.
  The place words come from the app, not the page: the page's own config
  in the app says "local server", which is wrong in a window. `places(...)`
  gives "This Mac" / "This iPad" / "This iPhone" (`Places.deviceName`, so
  the header says what the place switcher says; `KernelLocations.thisDevice`
  is "This Device" on iOS) for where the file is, the chosen remote's title
  for where kernels run (only where `place.allows(.kernelLocation)`), and a
  machine's name for both in a machine's window. `PageState.locked` is new
  (`PageState.locked` in `native.ts`, posted from `shown.locked`) and
  optional in Swift, so a page older than this one still decodes. The old
  `PageState.subtitle` is gone; `WindowTarget.subtitle(header:machineName:)`
  is the status line, or "on <machine>" with no notebook.
- **Mac.** The window subtitle is the full line. The system draws it and
  it can't be clicked, so the "tap the status" part is the kernel button's
  popover, which now starts with the line's text and the file's path. The
  button reads "Choose Kernel" with a warning icon while the kernel is
  missing, so that state shows without the subtitle. Toolbar, fixed order:
  New Notebook; Trust and Notebook Access (only while they apply, so they
  come first and nothing else moves; Trust used to be always there and
  disabled); Run Cell, a `Menu` with `primaryAction`, whose menu is Run
  All, Run with Parameters…, Clear All Outputs, Restart Kernel and Restart
  & Run All; Interrupt (always there, enabled while busy); the kernel
  button; Share; ⋯ (View as Journal, Insert Code Cell, Insert Markdown
  Cell, Cell Type, Save). A menu's `.disabled` would disable its primary
  action too, so Run Cell is enabled with a notebook open and its action
  checks `editsCells`: in the journal view it does nothing, and its items
  disable one by one. Save, Run All, restart, the journal toggle, Insert
  Cell and Cell Type left the toolbar; all are in the menu bar and ⌘S.
- **iPad and iPhone.** The principal item is the title over the status
  line as a `Menu` (file path, kernel version, kernel choices, Run Kernels
  On); the iPad shows the full line, the iPhone `short`, and VoiceOver the
  full text on both. It is red while the kernel is missing or saving is
  locked. The kernel choices and Advanced moved out of ⋯ into it. The iPad's
  trailing items are Trust and Notebook Access (while they apply), Run
  Cell, Interrupt, Share and ⋯; the iPhone keeps its bottom run bar
  (Interrupt, Outline, Run Cell) and gets only ⋯ at the top, with Share,
  Trust Notebook and Notebook Access… in it. The two layouts are separate
  `@ToolbarContentBuilder` properties, chosen by two `if`s, so neither is a
  long conditional chain for the type checker. `RunMenu.swift` holds the
  run menu both platforms share.
- **New command.** `restart-run-all` (`PAGE_COMMANDS`, `App.tsx`) runs
  the controller's `restartAndRunAll`, which the browser's run menu
  already used (#801).

Unsure, because there is no Swift toolchain here: `.labelStyle(.titleAndIcon)`
on a Mac toolbar item may still draw an icon only, depending on the
toolbar's display mode (the help tags carry the words either way); iOS 26
toolbars draw titleAndIcon labels. CI is the first compiler.
