# Brief: ganymede-ui #852, cell chrome (redesign step 2)

Implement issue #852 (read it in full: `gh` is not needed, the text is below in short). Work on this
branch, commit as one or a few commits, do not push, and delete this file in the last commit.

Target look: cards that hold code and output together, a round orange run button with the execution
count in the left margin instead of `[n]:` prompts, a quiet 1px accent border on the selected cell (2px
ring only for keyboard focus), the floating capsule with ↑ ↓ duplicate and ⋯ (Delete only inside ⋯),
output meta line ("SVG · 38 ms", "saved output") under a hairline instead of the "Saved output" label,
prose ~700px and code/output up to ~1000px, a mono eyebrow "TYPESCRIPT · 9 NOV 2026" above a journal's
title, larger heading scale, clear spacing rhythm.

Where things are:
- `src/styles/jupyter.css` (`.notebook-page` rules: `.jp-Cell`, `.jp-InputPrompt`/`.jp-OutputPrompt`,
  `.jp-mod-active::before` bar, `.jp-cell-toolbar`, touch rules under `.touch-ui`). Tokens in
  `src/styles/app.css` (`--accent`, `--accent-fill`, `--on-accent`, `--cell-bg`, `--cell-border`, `--ready`).
- Cell toolbar buttons: `src/lib/jupyterlab.ts` ~line 423 (`delete-cell` entry) and the
  `CellToolbarTracker` setup ~590. Remove `delete-cell` from the capsule; the ⋯ menu is `CellMenu`
  (`src/components/CellMenu.tsx`, already has Delete). Update `src/lib/jupyterlab.test.ts` expectations.
- "Saved output" label: `src/lib/output-labels.ts` (+ test). Turn it into the meta line.
- Journal view: `src/components/JournalView.tsx` — reuse the card/meta styles; source stays folded.
- e2e: `e2e/cell-controls.spec.ts`, `e2e/cell-toolbar.spec.ts` and any spec clicking the capsule's
  delete button or reading prompts like `[1]:` — update selectors.

Rules:
- No control may move under the pointer between idle/running/done (#812): reserve the run button and
  elapsed-time space.
- Every control has an accessible name ("Run cell"; while running "Running, 3 s"). Status dots have labels.
- New color pairs go into `src/styles/contrast.test.ts` (4.5:1 text, 3:1 indicators) in both themes.
- Touch (`.touch-ui`): don't add a second Run where the touch layout already has one.
- Dev log: add `docs/notes/2026-11-26-cell-chrome.md` starting `## 2026-11-26, Cell chrome (#852)`.
  Never edit docs/notes.md.
- Must pass: `npm run check`, `npx vitest run` (one known unrelated failure: packages/agent/src/settings.test.ts
  "rejects a key when storage is blocked", #848), and `npm run build`.
