## 2026-11-04, Mac terminal panel (#248)

Terminals on the Mac moved from their own windows into a bottom panel of
the notebook window, the first piece of the workspace layout Thomas chose
from the app mockups (#245).

- Every terminal stays in the view tree while the panel is hidden or
  another tab is selected (opacity 0, no hit testing), because
  `TerminalSurface` closes its transport when its view is dismantled.
  Moving a session between the panel and a main-area tab (#247) needs the
  transport to outlive its view first.
- The panel is laid out with a zero-height frame when hidden rather than
  removed, for the same reason.
- `TerminalTarget` and `TerminalRequest` moved to their own file so the
  unit tests can compile `PanelController` without SwiftUI views.
- Shown/hidden and height are `@SceneStorage`, so each window keeps its
  own across launches; the shells themselves don't survive a relaunch.
- Hiding a view with `opacity(0)` and no hit testing leaves AppKit's
  first responder alone, so keys went on to a hidden shell after a tab
  switch or ⌃`. The panel now tells each terminal whether it has the
  keyboard, and the terminal takes or gives it up when that changes
  (only then, so a click into the notebook sticks).
- Not done: the kernel log tab. Jupyter's API has no way to read a
  kernel's stderr, so it needs a server endpoint first (ganymede#365).
