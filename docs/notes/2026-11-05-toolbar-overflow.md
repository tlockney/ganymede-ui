## 2026-11-05, Toolbar overflow menu (#201)

- Each toolbar item has a priority and a menu form. `overflowing()`
  (`src/lib/overflow.ts`) hides the lowest priority first until the rest
  fit beside the "…" button. Run has an infinite priority, so a phone
  always keeps Run and "…". Order of leaving: Download, Shortcuts and
  the palette, the kernel picker, the cell type picker, Insert, Save,
  Trust, then Run All / Interrupt / Restart.
- Widths are read from the items while they show (all do on the first
  render) and remembered for when they don't. A hidden clone of the
  toolbar for measuring was tried first, but `getByTitle` and similar
  queries found every button twice: testing-library ignores
  `aria-hidden` for title queries.
- The title's room is its text's full width, capped at 120px, read from
  `scrollWidth` on `.title` and `.subtitle-text`. Those clip, so
  `scrollWidth` is the text's width. The `.title-block`'s own
  `scrollWidth` shrinks with the room it is given, which fed back and
  squeezed the title to nothing.
- `.toolbar-trailing` is now `flex: none` and `.toolbar-leading` takes
  the rest. With both shrinking, flex gave the long title most of the
  space, and the buttons spilled past the window edge.
- The phone CSS that hid the pickers and Insert went away; the overflow
  handles them, and they're now reachable from "…".
- jsdom has no layout, so the component shows everything when the
  toolbar is 0px wide. Unit tests stub `clientWidth`, `scrollWidth` and
  `getBoundingClientRect`, and `e2e/toolbar.spec.ts` checks 393, 507,
  820 and 1280px in Chromium.
