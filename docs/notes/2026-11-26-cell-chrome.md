## 2026-11-26, Cell chrome (#852)

A cell read as a loose block on the page: its `[1]:` prompts said nothing a
person needed, its toolbar mixed Run and Delete at the same size, and the
only statement about what a cell had produced was the output itself.

- `.jp-Cell` is a card (`--cell-bg`, `--cell-border`, 12 px radius), and
  the notebook's column is 1064 px wide, centred, so prose keeps its
  measure and cards have edges to see.
- The prompt column goes: `.jp-InputPrompt` and `.jp-OutputPrompt` are
  `display: none`. A code cell's margin instead holds a round Run button,
  its execution count, and the seconds of a run, from `cell-gutter.ts`.
  The gutter shows without `.touch-ui` only: touch keeps Run in the cell's
  menu, and a second Run beside it would be one too many.
- The button stays put between idle, running and done, and its time slot is
  reserved while empty (#812). While the cell runs the button is disabled
  and says `Running, 3 s`, for a screen reader too; the seconds move to the
  meta line under the outputs when the run ends.
- The toolbar capsule (`top: -13px`, a pill of `--window-bg`) keeps Move Up,
  Move Down, Duplicate and ⋯. Delete and Cell Type are in the ⋯ menu now,
  so a slip can't delete a cell from the capsule; the menu is the same
  `CellMenu` touch already used.
- Under a cell's outputs, one `gn-output-meta` line says what they are and
  how long the run took (`Text · Image · 1.2 s`), from `output-labels.ts`.
  With no kernel attached it says `saved output` instead, since nothing is
  there to say how long it took.
- Focus reads on the card: a selected cell takes the accent as its edge,
  and an editor with focus adds a 2 px ring of the accent around the card
  (`:has(.cm-editor.cm-focused)`), in place of a ring on the editor box.
- The journal's header splits in two (`.journal-eyebrow`): the language and
  the day of the earliest agent cell above the title, and who started it
  and the cell count below. Journal cells are cards of the same tokens, so
  the notebook and the journal read as one layout.
- `markdown-rail.ts` is gone: the cards replaced the rail it drew beside
  Markdown.
- Tests: `src/lib/cell-gutter.test.ts` for the margin; `output-labels.test.ts`
  and `journal.test.ts` for the meta line, kinds and header; the contrast
  checks cover the meta line on a card and the accent edge as an indicator;
  `e2e/cell-card.spec.ts` runs a cell from its margin and opens Delete and
  Cell Type from the ⋯ menu; `e2e/selection-focus.spec.ts` checks the card,
  its edge and the ring.
