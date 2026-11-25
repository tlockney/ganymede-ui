## 2026-11-25, Compact touch cell layout (#813)

Step 2 of #800. On a phone the prompt column, the right-hand gutter and two
rows of + Code / + Text buttons took width and height from the code.

- **Meta line.** `cell-controls.ts` puts a `.gn-cell-meta` line first in
  every cell: execution count (`In [n]` or `Not run`, none for Markdown),
  type, run state, and the "…" button, which moved into it. CSS shows it
  only on the active cell, only under 719.98px with `touch-ui` (the app's
  phone breakpoint); wider it is `display: contents`, so the gutter button
  is where it was. The prompts are hidden under that width, as is the drag
  handle ("where there is room"), and the cell's right padding goes. An
  inactive cell has no line and so no button until a tap makes it active.
- **Add cell.** Each cell's bar has a third button, "Add cell" (code cell;
  the menu changes the type). Under 720px only it shows, and only on the
  active cell and the last one (`gn-last-cell`, kept by `sync`), so there is
  one at the active boundary and one at the end: named "Add Cell Below" on
  the active cell and "Add Cell at End" on the last, "Add Cell Below" when
  they are the same cell. Wider, + Code and + Text are unchanged. Move Up
  and Down were already in the cell menu, and the keyboard bar is untouched.
- **Wrap Code.** `wrap-code.ts` is `markdown-preview.ts`'s mechanism: a
  local-storage switch (`ganymede-ui:wrap-code`, off by default), a
  CodeMirror compartment per editor that follows it, a palette command and
  page command (`toggle-wrap-code`), and a checkbox item in the cell menu
  (`ContextMenu` got `toggle` for `menuitemcheckbox`). It is disabled while a
  machine is away, like the other items.
- **Output hierarchy.** `output-labels.ts` adds a bar to the rendered
  output from the output model (JupyterLab renders an error as a stderr
  stream, so the DOM can't tell them apart): "Execution failed" plus
  `ename: evalue` for an error ("Execution stopped" for an interrupt:
  Jupyter's `KeyboardInterrupt` or cdp-kernel's `Interrupted`),
  "Warning" for stderr, and for a stream over 20 lines a bar labelled
  "Log, N lines" with "View full log" above a 10-line tail, scrolled to
  the end on a whole line. It re-adds the bar
  when JupyterLab replaces an output widget (a growing stream does), and
  is idempotent so its own changes don't loop. "Saved output" shows above a
  cell's outputs while the session has no kernel.
- **Run states.** `cellRunState` reads the classes `run-status.ts` sets
  (Running, Queued) and a last error of `KeyboardInterrupt` (Stopped), and
  puts the words in the meta line, which stays in the accessibility tree on
  a wide screen as visually hidden text (its other parts don't show there;
  the prompt keeps no title).

Not done: "Source changed since run" (waits on ganymede#943); a link to the
failing line; an Expand for table outputs (their 32em box still scrolls);
a drag handle under 720px.

By-hand checks are on #273 (iPad, iPhone). Follow-up: #822, an expanded
view for long source and tables.
