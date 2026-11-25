## 2026-11-25, Journal mode in the header (#819)

Part of #800, split from #816: the header names the current view,
Notebook or Journal, instead of the toggle living only under "⋯".

- **Browser.** `Toolbar.tsx` renders a two-part control beside the title
  when the controller has a journal toggle (`onToggleJournal`): two
  buttons with `aria-pressed`, in a `role="group"` whose accessible name
  says which mode shows ("View: Notebook" / "View: Journal"). Picking the
  other part calls the same `toggle-journal` as the More menu item, so
  the cell in view is kept (#816); the menu item stays. The title and
  the control share a `title-row` flex line — the title truncates first,
  so the control sits beside it however long the name — over the status
  line, which keeps the full width. The title's button carries its
  hover pill on `-4px` side margins, so the `.title` its content sizes
  came out 8px short of the box it needs and the name always ended in
  "…"; its cap is `calc(100% + 8px)` now, and the name truncates only
  when the toolbar really runs out of room. A touch screen
  (`title-row` is `display: contents`) spans the control over the title
  and the status line, so its 44px targets still fit the toolbar's 52px.
  A phone has no room beside the title, so there the control shows only
  in the journal view (`useNarrow`), so a notebook keeps its 52px header,
  and it gets a slim row of its own under the status line and `--toolbar-h` grows by its
  44px (`:root.touch-ui:has(.toolbar .mode-switch)` under 720px), the
  title and status line keeping the width they have without the control;
  the row's two buttons share its width, so the box ends at them and
  each is a 44px target.
  Below 720px the control is its icons.
- **Native.** `JournalViewPicker.swift` (both platforms): a segmented
  `Picker` bound to `page.state.journal` whose set runs
  `toggle-journal`, in the Mac toolbar and the iPad's trailing items,
  only while `page.state.hasNotebook` (a data file or a console has no
  journal). The ⋯ menu item stays everywhere; the iPhone keeps only
  that, its bar being the run actions in thumb reach (#209).
- Tests: `Toolbar.test.tsx` (the control shows only with a journal
  toggle, its name and `aria-pressed` say the mode, clicking the other
  part toggles and the showing part doesn't, on a phone only in the
  journal view), `e2e/journal.spec.ts`
  (switching from the header keeps the cell, reusing the #816 pattern;
  the name shows whole beside the control while the toolbar has room;
  at 375px the control fits, its two buttons filling its width as 44px
  targets, and the title and status line show whole, as without the
  control). Each fails without the change.

Built in Xcode 27.2: the Ganymede (Mac) and Ganymede-iOS (iOS arm64
simulator) schemes both build with the change. The segmented `Picker`,
`tag` and `ToolbarItem` are long-standing SwiftUI (macOS 10.15 / iOS 13)
APIs.
