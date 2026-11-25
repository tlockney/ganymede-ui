# Task for Hermes: finish ui#813, then ui#814

Repo: tlockney/ganymede-ui, branch `claude/project-thread-ulpr62`. The last
commit implements #813 (compact touch cell layout); read it first
(`git show --stat HEAD`), plus CLAUDE.md, CONTRIBUTING.md and
`docs/notes/2026-11-25-compact-cells.md`. Do NOT delete or rewrite history;
add commits. Delete this file in your last commit. Push when every check
below passes.

## Part 1: fix the review findings on #813

Medium:

1. Interrupts from our own kernels say `ename: "Interrupted"`,
   `evalue: "Execution interrupted"` (cdp-kernel), not only
   `KeyboardInterrupt`. Add one shared helper `isInterrupt(ename)` matching
   both, use it in `cellRunState` (src/lib/cell-controls.ts) and `labelFor`
   (src/lib/output-labels.ts). Unit tests for both names; an e2e that runs
   `while(true){}` on "This browser" at 390px, presses Interrupt, and sees
   "Execution stopped" and "Stopped".
2. e2e "a long log shows its tail": assert what is visible, not text
   content: `scrollTop + clientHeight` within 1px of `scrollHeight`, and the
   "step 59" line's rect inside the `pre`'s rect. Fix the whole-line check to
   `rest < 1 || line - rest < 1` (rest = scrollTop mod line height).
3. e2e at 390px with three cells, first one active: exactly two visible
   "Add cell" buttons, one under cell 1 and one under the last cell; the
   middle cell shows none.
4. Tests for untested wiring:
   - clearing the outputs of a Stopped cell (no class change) clears Stopped
     (exercises `outputs.changed.connect(refresh)`);
   - "Saved output" goes away when a kernel attaches, through NotebookPane;
   - compact `.gn-cell-drag` is hidden at 390px;
   - a long unbroken error value (a 200-char path) at 390px does not make the
     page scroll sideways.

Low:

1. README "Cells on a phone": say the compact layout applies to windows
   narrower than 720px (phones, iPad Split View, narrow browser windows), not
   "on a touch screen", and drop "an iPad keeps the gutter buttons".
2. Run state for assistive tech: put the state as visually hidden text inside
   the cell (e.g. `<span class="visually-hidden">Stopped</span>` in the meta
   line, which must stay in the accessibility tree on wide screens too), and
   reword the README claim to match. Use an existing visually-hidden class if
   one exists (grep for `visually-hidden` / `sr-only`).
3. Name the two Add buttons by position: "Add Cell Below" (active cell) and
   "Add Cell at End" (last cell); when they are the same cell, "Add Cell
   Below". Update tests and docs.
4. Test that tapping "View full log" does not change the active cell or focus
   an editor; if the `pointerdown` guard turns out unnecessary, drop it.
5. Clear the per-cell `opened` set when a cell's outputs are cleared, so a
   re-run opens at the tail again. Unit test.
6. Performance: don't re-scan the whole notebook on every DOM mutation; scan
   only the cell whose subtree changed, and cache the stream line count by
   text length. Keep the existing tests passing.

Nit: the stdout long-log bar has only a border and a button; label it
"Log, N lines" (N = line count) and keep the button.

Add a line to the dev log: follow-up #822 (expanded view for long source and
tables) and by-hand checks on #273.

## Part 1b: Lows left from PR #806 (browser header, merged)

Review comments on https://github.com/tlockney/ganymede-ui/pull/806:

1. `src/styles/app.css` (`.title-block{min-width:120px}` in the <720px
   block): at 320px the status line runs 26px under Run Cell. Use
   `min-width: min(120px, …)` or a smaller minimum below ~340px so the
   title never overlaps `.toolbar-trailing`; add 320 to the `fits at` loop
   in `e2e/toolbar.spec.ts`.
2. `docs/apps.md` "Running with parameters" Unreleased note: say only its
   place is new, e.g. "**Unreleased.** In the latest release, the browser
   shows Run with Parameters… in the toolbar's More menu, not the run menu."
3. `docs/notes/2026-11-25-browser-header.md`: record that below 720px Trust
   Notebook and Notebook Access move into ⋯ (to keep the title's room),
   departing from #801's "stay as visible buttons".
4. `src/components/Toolbar.tsx`: drop `|| openItems === 0` and `openItems`
   (can't happen; untested).

## Part 2: ui#814 color, type and focus

Read the issue: `gh api repos/tlockney/ganymede-ui/issues/814 --jq .body`.

- Stronger secondary text for metadata: prompts, `.gn-cell-meta`, status
  line (`.status-line`), at least 4.5:1 in light and dark; add the colours to
  `src/styles/contrast.test.ts`.
- Selection vs editor focus: selected cell keeps the blue rail; an editor
  with focus also gets a 2px focus ring on the editor box; they must look
  different (a selected cell without editor focus has no ring).
- Long Markdown cells (taller than ~12 lines): a short marker at the top
  instead of a full-height rail.
- Wide charts and tables may extend past the prose column up to the
  notebook's width (cap at the pane width, no page sideways scroll).
  Add a dev log `docs/notes/2026-11-25-color-focus.md` starting
  `## 2026-11-25, Color, type and focus refinement (#814)`.

## Checks before push (all must pass)

```
npm ci            # if node_modules is missing
npm run check
npx vitest run
npm run build
npx playwright test --trace off
```

Take screenshots at 390px and 1280px, light and dark, of a notebook with a
long log, a failing cell and an active cell, into
`.github/pr-screenshots/813/` (deviceScaleFactor 2), and commit them.
