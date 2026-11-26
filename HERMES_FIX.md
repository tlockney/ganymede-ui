# Fix round for #852 (branch claude/project-thread-lsz12d)

A pre-push review and screenshots found the problems below. Fix ALL of them on this branch. Commit as
"Address review of the cell chrome (#852)" (more commits are fine), delete this file in the last commit,
do not push. Then run: `npm run check`, `npx vitest run` (only the known #848 failure allowed),
`npm run build`, and the FULL e2e suite (`npx playwright test --trace off`); every spec that passes on
origin/main must pass here. Report any spec that also fails on origin/main.

High
1. Invisible "Collapse Output" overlay covers each output's left 56px. jupyter.css ~155: `.jp-OutputPrompt`
   is hidden but JupyterLab's `.jp-OutputArea-promptOverlay` (position:absolute; width:
   var(--jp-cell-prompt-width)) still sits over the output and intercepts clicks (anywidget.spec.ts:24,
   table-paging.spec.ts:15 fail). Hide it / give it zero width under `.notebook-page`; output collapse stays
   available from the cell menu / existing shortcut. Add an e2e check with elementFromPoint at an output's
   left edge returning the output content, not the overlay.
2. wide-outputs.spec.ts:192 and :258 fail (narrow output right edge 15px inside the cell because of the
   card's 14px right padding + 1px border; left-edge hit = finding 1). Fix the cause; also wide outputs are
   centred on the output row inside asymmetric padding (60px left, 14px right), shifting them ~23px right.
   Centre wide outputs on the pane again and make the spec's geometry hold.

Medium
3. Queued cells say "Running" and count queue time (cell-gutter.ts ~794-813, output-labels.ts ~1573-1586).
   JupyterLab sets executionState='running' on every scheduled cell; `src/lib/run-status.ts` already uses
   RunQueue to tell running from queued and has `formatElapsed`. Drive the gutter label/time and the meta
   line's time from RunQueue: queued -> label "Queued" and no timer; running -> "Running, 3 s" from the time
   it actually started; meta-line time = actual run time. Reuse run-status helpers instead of a second timer.
   Unit tests for a queued cell.
4. At 720-760px without touch-ui, `@media (width <= 760px)` moves `.gn-code-toggle` to left:6px; top:0 and it
   covers the Run button (jupyter.css ~947-955). Drop that override for non-touch; add a 740px e2e check that
   elementFromPoint at the Run button's centre is the Run button.
5. Markdown cells must stay borderless prose: only code cells are cards (`.jp-CodeCell`), Markdown cells have
   no border, no fill. In the journal (`.journal-cell`, app.css ~2679) notes/findings are not cards either,
   and a finding paragraph right after a figure sits attached to it (small gap, as in the mockup).
6. On touch at 720px and up the execution count disappears entirely. Show the count (no Run button) there,
   e.g. on the meta line, and fix the CSS comment. Add a test.
7. Missing pieces of #852:
   - a spinner (ring) in the Run button while a cell is running, not only a pulse;
   - keyboard focus in command mode (`:focus-visible` on the cell) shows the 2px accent ring again;
   - the selected (not focused) cell border is the quiet 1px accent at ~45% alpha
     (dark rgba(249,160,63,0.45); light the same from the light accent token), not solid --accent;
     edit mode keeps the 2px ring;
   - the eyebrow also shows in Notebook view for journal notebooks, not only in JournalView;
   - eyebrow date formatted like "9 NOV 2026" (day, short month, year, uppercased), not toLocaleDateString;
   - JournalView figures use the same meta line;
   - "saved output" on the meta line for outputs that came from the file even when a kernel is attached
     (until the cell is re-run).
8. Tests: an e2e or unit test that the gutter Run button is hidden under `.touch-ui`; a test for the
   command-mode :focus-visible ring.
9. Docs: README.md ~292 and docs/apps.md ~132 say the chevron is "left of its prompt"; reword (chevron sits
   between the Run button and the code). docs/apps.md change needs no Unreleased note only if it describes
   an already released feature; otherwise add the `**Unreleased.**` note per CLAUDE.md. Fix the
   jupyter.css comment that says "max-width 920px" (now 1064px).

Low
10. output-labels.ts ~1611: `meta.title` is set only on creation; set or remove it on every pass. Assert in
    the kernel-attach test.
11. Add a unit test for the per-cell teardown on cell disposal (cell-gutter.ts ~843). `runCell` in
    NotebookPane.tsx duplicates CellMenu's run closure: share one helper.

From screenshots (03 Charts and Diagrams, 1440 dark)
12. The selected cell's capsule (up, down, duplicate, more) sits inside the card over the first code line,
    hiding code. Put it on the card's top edge, right ~10px, translateY(-55%), so it covers no code (the
    mockup's position). Don't let it move between states.
