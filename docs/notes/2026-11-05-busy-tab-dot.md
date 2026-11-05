## 2026-11-05, A dot on a notebook's tab while its kernel runs (#247)

- A notebook window's tab gets an accessory view, a small accent-coloured
  dot, while the page reports the kernel `busy`, and loses it when the
  kernel goes idle. AppKit draws the accessory in the tab bar, so a run
  in a background tab shows without switching to it. A window without
  other tabs has no tab bar, and the dot isn't seen there.
- `WorkspaceTabs.markBusy` leaves the view in place while the state
  stays busy, so the dot doesn't flicker as `PageState` updates.
- Still open on #247: splitting a tab right (native window tabs can't),
  and the by-hand Mac check.
