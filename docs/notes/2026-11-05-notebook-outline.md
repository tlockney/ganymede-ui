## 2026-11-05, Notebook outline (#212)

- `src/lib/outline.ts` reads Markdown cells' headings: ATX (`#` to
  `######`), setext (`===`/`---` under a line) and `<h1>`–`<h6>`, skipping
  fenced and indented code. Heading text drops Markdown marks, but
  underscores count as emphasis only at word edges, so `snake_case`
  names stay as written. Escaped marks are set aside before the marks
  are stripped, so `\*` survives.
- The pane recomputes the outline 300 ms after the model stops changing:
  `contentChanged` fires on every key. It compares by JSON so an edit
  that doesn't touch a heading doesn't re-render the toolbar or re-post
  the app's state.
- `goToCell` scrolls with `Notebook.scrollToCell(cell, 'start')`, which
  works with the windowed notebook, where a cell far down may have no DOM
  yet.
- The Mac app gets the outline in `PageState.outline` and goes to a
  heading with the `go-to-cell` page command (the cell's index).
