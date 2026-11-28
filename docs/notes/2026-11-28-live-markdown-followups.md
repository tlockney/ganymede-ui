## 2026-11-28, live Markdown preview follow-ups (#673)

Finished the remaining constructs and Mac wiring for the Live Markdown
preview while keeping the preview off by default pending final by-hand
and large-cell verification on `#399` and `#273`:

- **Remaining Markdown constructs (`src/lib/markdown-preview.ts`,
  `src/lib/markdown-preview-render.ts`, `src/styles/jupyter.css`):**
  tables rendered as an HTML grid outside the cursor (with column
  alignment, inline formatting, math, images, and cell-level cursor
  jump on click), `$…$` / `$$…$$` math typeset through the shared
  `MathJaxTypesetter` matching the cell's full render with per-typesetter
  DOM caching, inline images (`![alt](url)` and `<img ...>`) resolving
  external `https:`/`http:`, safe raster `data:`, `attachment:`, and
  notebook-relative paths through `UrlResolver` while rejecting unsafe
  schemes, interactive GFM task-list checkboxes (`[ ]` / `[x]`),
  ordered-list numbering, hanging indents on wrapped list and quote
  lines, fenced code language highlighting via `EditorLanguageRegistry`,
  collapsed setext heading underlines, autolinks (`<…>`), bare URLs,
  and safe inline HTML tags.
- **Cursor motion and large-cell performance:** block and cross-line
  decorations live in the `StateField` (`Table`, setext underlines,
  display/multiline math) with a selection fast-path that returns in
  O(blocks) when cursor movement does not cross any block boundary,
  while line and inline decorations run in a `ViewPlugin` scoped to
  `view.visibleRanges`. Hidden replacement ranges and widgets are
  exposed through `EditorView.atomicRanges` so character/vertical cursor
  movement and pointer clicks skip across hidden markers cleanly while
  cursor-inside reveal still exposes every marker character for editing.
- **Mac `View` menu & review tests (`apple/Sources/Ganymede/`,
  `src/lib/native.ts`, `src/App.tsx`):** added `liveMarkdown` to
  `PageState`, subscribed `App` to `onLiveMarkdownChange` so all windows
  stay synchronized, added **View › Show/Hide Live Markdown Preview**
  (`LiveMarkdownCommand`) wired to `toggle-live-markdown`, and added the
  missing `#674` tests (`completeHTMLTags: false` and `storage` event
  `key === null`) plus coverage for every new construct and a large-cell
  performance test.
