## 2026-11-27, Mac toolbar matches the mockup (#892)

The Mac's toolbar had grown by one button per feature: Run Cell stood
apart from the menu arrow that belongs with it, Interrupt had a capsule
of its own, and Share, ⋯ and the inspector's toggle each had one, so the
row read as six floating pills over a near-black band. Issue #892 has it
read as the redesign's mockup does: one capsule per group, over the
page's own surface, with a notebook's title in it.

- Run is the leading segment of the run capsule and the toolbar's only
  filled control: `AccentFill` (#f9a03f) with `OnAccent` (#2a1600) on it,
  light and dark. Its menu arrow and Interrupt follow it inside the
  capsule, to its right, Interrupt icon-only and enabled only while the
  kernel runs. A notebook's cell still runs from Run, so the label is
  "Run" where the accessibility label stays "Run Cell".
- Share, ⋯ and the inspector's toggle make the trailing capsule, in that
  order. The inspector toggle moved here from `ContentView`'s toolbar,
  and the toolbar's Terminal Panel button is gone: View > Show/Hide
  Terminal Panel (⌃`) stays, and ⋯ has the same item, titled by the
  panel's state.
- The system's `ControlGroup` styles were tried first and neither fit:
  the automatic style draws each child its own glass, and the navigation
  and palette styles join them but drop the Run segment's fill. So the
  run group is one `HStack` inside its `ToolbarItem`, letting the
  toolbar's own glass draw the capsule once (matching the trailing
  Share/More/Inspector group in both dark and light mode, where a
  hand-drawn `.regularMaterial` capsule barely separated from dark navy).
  The trailing capsule uses the navigation style's segmented look.
- Notebook windows take the page's surface: a `WindowBackground` colorset
  (light #fbf9f5, dark #181c2f, `--window-bg` in the stylesheet) paints
  the toolbar band, and the hosting `NSWindow`'s `backgroundColor` is set
  to it once per window — a weak set of the windows already coloured
  tracks which — and again when the notebook state changes, so the band
  above the window's content shows no second colour. The first attempt set
  it from a layout pass, and its repeated window mutation looped the main
  thread in AppKit layout until the app wouldn't finish launching.
  `titlebarAppearsTransparent` came out with it.
- The toolbar's title follows the notebook's display title:
  `metadata.title`, else the plain text of its first `#` heading, else
  the file's name without its date. `displayTitle` in
  `src/lib/journal.ts` computes it where `setTitle` already ran, so the
  toolbar, the tabs and the window title all follow one rule, while the
  sidebar and tooltips keep the file's name. A `TitleText` colorset
  (#f4e9d8 dark, the page's heading colour in light) colours it.
- The controls keep their order as state changes, so nothing moves under
  the pointer: Trust and Notebook Access appear and go before Notebook |
  Journal, and Interrupt's enablement and the "Edited" line change
  without moving Run or the trailing capsule. The trailing groups sit in
  the toolbar's primary-action region, which lays them out at the trailing
  edge; in `.automatic` they ran on from the kernel's chip, so at 1440
  points the toolbar's right third stood empty and a flexible spacer
  between the two regions did nothing. The update button stays in the
  leading region, before them, so an update arriving moves nothing.
