## 2026-11-26, the page says the eyebrow and the windows say the title (#867)

Under the Apple apps' own chrome (`chrome=native`, #205) the page draws no
toolbar, so nothing above the cells said what a notebook is, and a
journal's window was titled with its file's name — the day it started,
`2026-11-09-fremont-bridge` — while the notebook itself has a title.

- The eyebrow ("TYPESCRIPT · 9 NOV 2026") was only the toolbar's
  (`Toolbar`'s `c.eyebrow`, `.title-eyebrow` from #852). `NotebookPane`
  now renders `<p className="page-eyebrow">` above its `.notebook-page`
  when it is given `native` (`App` passes `chrome=native`), the notebook
  view is showing (the journal's header has the eyebrow already), and
  `journalHeader` gives one: an agent's notebook, with a language. The
  apps' page has no `.touch-ui`; an iPad's does, and keeps the line,
  where a phone has no room for it: `.touch-ui` at the phone's width
  (719.98px, the width the rest of the CSS calls a phone) hides it, as
  the toolbar's `.touch-ui` hides its eyebrow on both.
- The line sits in the cells' column, and the column's edge is two
  paddings in: the notebook's own 32px inside the 1064px measure, then
  JupyterLab's `--jp-notebook-padding` (10px) on the cells' viewport. The
  e2e caught the second one: with only the 32px the line was 10px left of
  the cards. It uses the variable, so a theme's padding carries.
- `.notebook-page` fills `.content`, so the scroll area would cover a line
  in the flow above it: it starts 30px down (6px + 16px of line, 8px of
  margin) while the line is there, and none of that on a phone, which
  hides the line.
- `PageState.title` (the page's post to the app, `src/lib/native.ts`) is
  the open notebook's `metadata.title` when it is a non-empty string,
  else null: `notebookTitle` in `journal.ts` reads it, trimmed (a title of
  spaces is no title), and `journalHeader` uses it for its title too.
  `NotebookPane`'s controller carries it, so the post needs no new state.
- The Swift `PageState.title` is optional: a page from an older build
  sends no key, and decodes to nil.
- `WindowTarget.displayName(fileStem:metadataTitle:)` is the window's
  name: the title when the page reports one, else the file's name with a
  leading `YYYY-MM-DD-` taken off — only when something is left, so
  `2026-11-09-` keeps its name, and `fremont-2026-11-09` and `notes` are
  untouched. `displayTitle` and `tabTitle` use it for `.file` and
  `.machineFile`, so a machine's window still ends `· m4mini`; folders and
  consoles are as they were, and the sidebar keeps the file's full name.
- Tests: `journal.test.ts` (`notebookTitle`), `NotebookPane.test.tsx` (the
  line with `native`, in the page and above it; none in the toolbar
  chrome), `native.test.ts` and `App.test.tsx` (the state's `title`, and
  null with no notebook), `PageStateTests` (decoded, absent and null),
  `WindowTargetTests` (`displayName`'s cases, `tabTitle` with a title),
  and an e2e in `e2e/journal.spec.ts` that opens a notebook with
  `chrome=native` and checks the line's text, that the page starts below
  it and that its text starts where the cell's edge does, and another
  that finds the line on an iPad and not on a phone.
- The folded strips that label a filled window (`FoldedStrip`, #250) use
  the window's title too: `displayTitle` with the page's `metadata.title`
  and a machine's name, so a notebook the page titled says that where the
  strip has room for words and in its help. The sidebar beside it keeps
  the file's name.

Checked with `npm run check`, `npm run test`, the vitest files above,
that e2e, and `xcodebuild test` for the `Ganymede` scheme on macOS
(`PageStateTests` and `WindowTargetTests`, after `bootstrap.sh`; the app
target builds ContentView with them).
