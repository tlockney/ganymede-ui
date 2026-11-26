## 2026-11-26, The notebook stays laid out under the journal (#841)

In the Mac app (v0.17.1), after Notebook → Journal → Notebook, a one-line
code cell whose code is wider than the cell drew its sideways scrollbar
over the code, with a vertical scrollbar beside it: the editor's scroller
had no room for the scrollbar under its one line.

- The journal hid the notebook with `display: none`
  (`.notebook-page[hidden]`). Switching back laid the whole notebook out
  again, and macOS WebKit with classic (always shown) scrollbars sized a
  one-line `.cm-scroller` without its scrollbar's height. Opening the
  notebook directly is fine. Chromium and WebKitGTK, with classic or
  styled scrollbars, size it right either way, so CI can't show the
  squash itself.
- `.notebook-page[hidden]` is now `display: block; visibility: hidden`.
  The journal (absolute, opaque) covers it; hidden from sight, the
  pointer, focus and assistive tech, and switching back lays nothing out
  again. The keyboard handlers already ignore the notebook while the
  journal shows, and the switch blurs a focused editor.
- Back from the journal, `goToCell` put the cell flush at the top only
  because JupyterLab's `scrollToItem` read a viewport height of 0 from a
  notebook just out of `display: none`, so its quarter-view margin was 0.
  Laid out, the margin is real (205 px at 820 px). `goToCell(index, true)`
  asks for no margin, keeping #816's placement; the other callers keep
  JupyterLab's margin.
- e2e/journal.spec.ts: under the journal the notebook stays laid out,
  hidden, and its editor can't take focus; back in the notebook the
  one-line wide cell's editor is the height it was. The layout check fails
  on `display: none`.
