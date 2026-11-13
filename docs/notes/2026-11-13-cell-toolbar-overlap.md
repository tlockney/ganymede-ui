## 2026-11-13, Cell toolbar over a long first heading (#551)

In the Mac app, a notebook whose first cell is Markdown with a long
heading opened with the cell toolbar drawn over the heading.
JupyterLab's `CellToolbarTracker` hides the toolbar when the first line
runs under it, but it checks once, in a `requestIdleCallback` after the
cell becomes active, and again only on the cell's `displayChanged`.
Markdown renders asynchronously. WebKit runs idle callbacks sooner than
Chromium, so the check could see a cell with nothing rendered yet,
decide there was no overlap, and never look again: a cell that stays
rendered emits no `displayChanged`.

`recheckToolbarOverlap` (src/lib/jupyterlab.ts) watches the active
Markdown cell's input area with a `ResizeObserver` and emits the cell's
`displayChanged` when it changes size, which reruns the tracker's check
after the Markdown renders, after someone else edits it, or when it
rewraps. The tracker is the only listener on `displayChanged`.

Chromium alone never showed the bug in e2e. `e2e/cell-toolbar.spec.ts`
replaces `requestIdleCallback` with a `setTimeout(0)`, as soon as
WebKit's can run, and then fails without the fix. Lesson: a layout race
seen only in the apps can often be reproduced in Chromium by making its
timing primitives behave like WebKit's.
