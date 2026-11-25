## 2026-11-25, Color, type and focus refinement (#814)

Step 2 of #800, after #813: the secondary text the review measured, and
the two kinds of attention a cell can have.

- **Metadata text.** A new `--meta-color` token (`rgba(60, 60, 67, 0.78)`
  light, `--text-2` dark, which already passes there) takes the status
  line's and the compact cell meta line's text, as `--prompt-color` took
  the prompts' in #799. The `--text-2` they had reads 4.36:1 in light on a
  selected cell's `--accent-soft` and 4.47:1 on the status line's own
  hover fill, both under WCAG AA's 4.5:1. The colours are in
  `src/styles/contrast.test.ts`, beside #799's: the status line on the
  toolbar and on its hover fill, the meta line on the page and on a
  selected cell.
- **Selection vs editor focus.** A selected cell keeps the blue rail;
  an editor with focus gets a 2px focus ring on the editor box (the
  1px line with the soft halo it had read as a selection glow). A
  selected cell without editor focus has no ring, so selection and
  focus look different; `e2e/selection-focus.spec.ts` proves each state
  by its computed shadow, in both directions.

Not done: the short marker for a long Markdown cell, and wide charts and
tables past the prose column.
