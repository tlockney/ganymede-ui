## 2026-11-25, Browser header: a status line, Run and Interrupt always in view (#801)

The browser toolbar's subtitle ("TypeScript · Starts when you run a cell")
truncated, said nothing of where the notebook lives, and the toolbar moved
buttons into a "…" menu by measured width, so Interrupt and the kernel
picker came and went as the window changed. Part of #800; option A of the
header mockups.

The subtitle is now a button, the status line, with `statusText`
(`src/lib/header-status.ts`) building it from the backend's config:
`<save> · <runs> · <kernel>[ · <state>]`.

- Save: "Saved in this browser", "Saved on _host_" (the machine's name for a
  connected machine; "local server" for the page's own server, as
  `connect` words its `detail`, rather than the origin's host, which in
  an app window is `127.0.0.1:<port>`), "Edited" for unsaved edits, and
  "Locked: changed on disk". The title lost its " — Edited" suffix;
  `NotebookTitle` no longer takes `dirty` or `locked`.
- Runs: "Runs here" for the browser backend and for `kernels=page`; "Runs on
  _host_" for a server. With `kernels=both` it depends on the kernel: the
  page's own spec (`cdp-browser`, now named in `kernel-device.ts` so light
  code can use it) runs here, any other on the server; with no kernel
  chosen, or a missing one, the part is left out.
- Kernel: its display name, or "_name_ (not installed) · Choose kernel". The
  state (Running, Starting, Restarting, Stopped, ...) follows only when it
  isn't idle or unstarted; the dot still shows every state.
- Its accessible name is the whole line; on screen it ellipsizes. It opens a
  menu with the file's path, the kernel's version line and the kernel
  picker, which left the toolbar (the `<select>` and its tooltip). The menu
  got a `note` item for the lines that aren't actions.

The right side is a fixed order with no width logic, so the
`ResizeObserver` measuring, `lib/overflow.ts` and the item priorities are
gone: Trust and Notebook Access when they apply, the Run Cell button
(filled, with its label) joined to a ▾ menu (Run All, Run with
Parameters…, Clear All Outputs, Restart Kernel, Restart & Run All),
Interrupt (always there, disabled unless busy), Share, and "⋯". Labels hide
below 720 px, and below 1020 px while the sidebar takes room, by media
query; the accessible names stay. On a phone the line takes two rows and shows a short form, `shortStatusText`: the save word (Saved, Edited, Locked) and where it runs, without the kernel, so a long host can't push the runs part out; the accessible name and the menu keep everything. Locked with unsaved edits says both. Menu notes (the path, the version line) aren't items, so the menu's `aria-describedby` points at them. Run Cell's blue is
`--accent-fill`, the filled-button colour #799 introduced (4.5:1 or more
under white text, checked by `src/styles/contrast.test.ts`).

Below 720px, Trust Notebook and Notebook Access leave the toolbar for the
⋯ menu, so the title keeps its room for the status line. This departs
from #801's "stay as visible buttons when they apply, since they ask for
a decision": on a phone the two decisions cannot stay visible and leave
the title anything, and the ⋯ menu keeps them one tap away.

Restart & Run All is `restartAndRunAll` on the controller: the restart and
the run are one action, so a restart that fails is reported and the cells
don't run (Retry repeats both). It runs through `reportRun`, so a failed
run shows the run's notice.

Specs and e2e: the e2e waits for the kernel by the status dot's class
(`s-idle`, `s-none`) instead of the subtitle's words, and picks menu
actions with `toolbarMenu`. Keyboard shortcuts and the Command Palette are
unchanged. The native Mac and iPad chrome is a separate issue.
