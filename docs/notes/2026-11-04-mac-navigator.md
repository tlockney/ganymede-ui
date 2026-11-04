## 2026-11-04, Mac navigator sidebar (#246)

The Mac sidebar became a strip of navigator tabs (Files, Search, Running,
Outline, Recents), layout B from the app mockups (#245).

- Search runs in Swift over the window's folder rather than through the
  page's search (#233): the Mac app reads the disk directly, so it needs
  no page command and works before a notebook is open. It keeps #233's
  limits (6 levels, 300 folders, 5000 entries, 200 notebooks read) and
  says when it stopped early. Content search reads each notebook's JSON
  and is off until ticked.
- Each tab is `@SceneStorage`, as are the query and the checkbox, so a
  window keeps them across launches.
- ⌘1 to ⌘5 select tabs, as Xcode's navigators. If main-area tabs (#247)
  later want ⌘1 to ⌘9 as Safari does, one of the two has to move.
- Outline is a placeholder until #212 lands.
- The scan runs in a detached task, which doesn't inherit cancellation.
  `withTaskCancellationHandler` passes the view task's cancellation on,
  and the scan checks `Task.isCancelled` between entries, so a newer
  query stops the older scan instead of letting scans pile up.
- Not done yet: terminals in Running and the server line at the foot
  of the sidebar (#246 stays open for them).
