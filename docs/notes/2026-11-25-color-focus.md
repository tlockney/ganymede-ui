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
- **Long Markdown cells.** A Markdown cell taller than twelve of its own
  lines keeps a short marker at the rail's top instead of the bar down
  all of it, which read as a selection of everything
  (`src/lib/markdown-rail.ts` watches each Markdown cell with a
  ResizeObserver and sets `gn-mod-tall`; jupyter.css caps the active
  cell's `::before` at 28px). A shorter cell keeps the rail, and a code
  cell keeps it always. `e2e/markdown-rail.spec.ts` proves both by the
  marker's computed height.

- **Wide charts and tables.** An image or table wider than the column
  the cell's outputs sit in goes wide (`gn-mod-wide`, set in
  `src/lib/output-labels.ts`'s per-output pass from the image's
  `naturalWidth` or the table's content width): jupyter.css, on a
  window 720px or wider, spans the pane with it, past the column on
  both sides — the notebook's scroll area
  (`.jp-WindowedPanel-outer`), less the same 32px gutter the column
  has, which output-labels.ts keeps in `--gn-pane`, set on the scroll
  area by every scan and moved by a ResizeObserver, which the sidebar
  opening and closing over the pane moves as well as the window. The
  output area and its row get `overflow: visible` there or they clip
  the span at the column's edge. A scrolled cell (`metadata.scrolled`)
  keeps its height cap and gets none of this: its wide output stays in
  the column and its area scrolls sideways, because an area can't
  scroll to anything left of it, so a span would cut off the left part. The
  cell, the editor and the prose keep the column, and the pane never
  scrolls sideways: the span is capped inside it. The prose column is
  measured on the output row rather than the output, so it is the
  same however the class has the output laid out, and the class is
  kept within 8px of the line, so a resize that lands an output on it
  doesn't flip the class back and forth. An image that hasn't loaded
  yet is listened for once and decides when it has; a stream never
  widens — its text has nothing to measure, and scrolls in its own
  box (#133). The compact layout has no column to spare, so there
  nothing extends. `e2e/wide-outputs.spec.ts` proves the geometry at
  1600px — with the sidebar open and closed, and the window resized —
  and the cap at 390px, on saved outputs.
