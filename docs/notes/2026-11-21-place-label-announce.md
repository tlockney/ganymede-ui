## 2026-11-21, Announce reachability in the place label (#775)

The sidebar's place label is a status live region, but its only changing content was its `aria-label`, and screen readers don't announce a changed `aria-label`. The label now holds visually hidden state text ("reachable" or "offline") after the dot, and `aria-atomic="true"` so the whole region is read on change.
