## 2026-11-05, Notebook outline (#212)

- `src/lib/outline.ts` reads Markdown cells' headings: ATX (`#` to
  `######`), setext (`===`/`---` under a line) and `<h1>`–`<h6>`, skipping
  fenced and indented code. Heading text drops Markdown marks, but
  underscores count as emphasis only at word edges, so `snake_case`
  names stay as written. Code spans and escaped marks are set aside before
  the marks are stripped, so `` `__init__` `` and `\*` survive. Only
  tag-shaped `<…>` is removed, so `x < 5 and y > 3` stays. A list item or
  quote before `---` is not a setext heading.
- The pane recomputes the outline 300 ms after the model stops changing
  (a debounce: `contentChanged` fires on every key), and at once when cells
  are added, removed or moved, so a heading never points at the wrong cell.
  It reads only Markdown cells' sources, so output streaming into a code
  cell costs little. It compares by JSON so an edit
  that doesn't touch a heading doesn't re-render the toolbar or re-post
  the app's state.
- `goToCell` scrolls with `Notebook.scrollToCell(cell, 'start')`, which
  works with the windowed notebook, where a cell far down may have no DOM
  yet.
- The Mac app gets the outline in `PageState.outline` and goes to a
  heading with the `go-to-cell` page command (the cell's index).
- The iPad and iPhone apps don't show the outline yet; their sidebar's
  Outline tab comes with #277, and wiring `PageState.outline` into it is a
  follow-up.
