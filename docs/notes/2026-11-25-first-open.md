## 2026-11-25, First open in the browser (#815)

A fresh page, with no saved connection, no `?token=` and no login on the
page's own server, used to open the connection sheet ("Where should
kernels run?") at once. A newcomer was asked for a server, a token and a
placement before seeing any notebook. The first screen now offers three
actions, in `StartScreen`, which `EmptyState` shows when nothing is
connected: **Try a Notebook** (the browser backend and the sample),
**Open a Notebook…** (a `.ipynb` from the device, saved in the browser's
storage) and **Connect to a Server…** (the existing sheet, unchanged).
Server URL, token and placement appear only in the sheet.

The sample now leads with one short code cell that needs no package and no
network (`const moon = "Ganymede"` and a template string), whose comment
(two short lines, so it fits a phone) names both ways to run it: Shift-Enter, or the ▶ button in the toolbar,
which stays on a phone. The intro that used to be first follows it.

Decisions:

- The sheet stays behind Connect to a Server…, and its Cancel is always
  offered now, so Cancel and Escape go back to the start screen. In the
  Apple apps (`chrome=native`) they stay hidden and `EmptyState` keeps its
  plain Connect… button: those apps always have a config, so the start
  screen never shows there.
- Try and Open set a pending start in `App`, connect the browser backend,
  and run the start once that backend is up, in an effect on the backend
  rather than in the connection's success path. The effect runs once per
  backend whatever a StrictMode rerun or a cancelled connection did, and
  its cleanup drops the notebook it would open if the backend is replaced
  during the copy. The sheet can't pick a backend while Try connects (its
  button is disabled); every pick it makes, including a retry after a
  failed connection, drops the pending start, so no later connection
  copies a sample nobody asked for. A reload restores the saved browser backend
  and the `?open=` notebook and copies nothing.
- A failure of the copy shows in the pane notice. A file that isn't a
  notebook (the name, invalid JSON, JSON without `nbformat`) is refused on
  the start screen with a `role="alert"`, using `parseNotebook`, and
  connects nothing.
- Where browser work is stored is said twice: on the start screen under
  Try and Open, and in a note above a notebook of the browser backend
  (`StorageNotice`, not for data files, the console or the apps) with
  **Download a Copy**. Dismissing it is per origin
  (`ganymede-ui:storage-notice`, with an in-page fallback when storage is
  off, as the onboarding does). It floats over the foot of the notebook
  so the toolbar and first cell don't move.
- After Try from the keyboard the button is gone and focus is on the body,
  so a notebook that opens with nothing focused now takes focus in command
  mode (`NotebookPane`). One that opens from a control that keeps focus
  leaves it there.

- In a short window (a phone on its side, 852×393) the last button was
  out of reach: `.window`'s implicit grid row grew to the start screen's
  height, below the visible window. The row is now `minmax(0, 1fr)` and the
  start screen scrolls when it doesn't fit (`e2e/first-open.spec.ts`, and
  the landscape cases of `e2e/safe-area.spec.ts` that caught it).

No CDN: since #794 the browser kernel fetches DuckDB's files only when
SQL or Parquet is first used, so Try makes no request outside the app's
origin; the e2e test aborts and counts every one.

Action names: the browser's **Open a Notebook…** and **Connect to a
Server…** are the start screen's own; the apps never show it (they always
arrive with a backend), open files with their File menu's **Open…**, and
pick kernels in Settings › Kernels, so there is no matching app action to
rename here.

Tests: `StartScreen.test.tsx` (the three actions and their order, no focus
taken, the hidden file input, valid and invalid files, the error cleared),
`StorageNotice.test.tsx`, `EmptyState.test.tsx`, the sample tests, the
`NotebookPane` focus tests, and `App.test.tsx` (no sheet on first open,
Cancel and Escape back, Try with StrictMode, a failed connect, a failed
copy, Open, the notice in each backend and the apps, reload, the palette
entry and Change…). `e2e/first-open.spec.ts` starts from clean storage with
other origins blocked: Try by keyboard (Tab, Enter, Shift-Enter), the
notice, a reload, Download a Copy, and Dismiss; Try by touch on a phone;
Open with a notebook and with files that aren't; screenshots of the start
screen at 1440 and 390 wide, light and dark. The e2e specs that connected
through the sheet on a fresh page open it from the start screen
(`openConnectSheet`, `useThisBrowser` in `e2e/helpers.ts`).
