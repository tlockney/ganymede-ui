## 2026-11-04, Mac window tabs (#247)

Notebooks, text files and terminals open as tabs of one window, using
AppKit's own window tabs rather than a tab bar drawn inside the window.

- Why native tabs: the drag-out, Merge All Windows, Move Tab to New
  Window, tab overview and ⌃Tab come for free, and each tab is still one
  window with its own `PageModel`, `PageDocument`, close guard and
  toolbar, so the toolbar follows the active tab with no new code. A tab
  bar inside one window would need one web view, page model and document
  per tab inside `ContentView`, and the menus' focused objects to follow
  the selected tab.
- The cost: each notebook tab has its own sidebar (the mockup showed one
  shared sidebar), and a tab can't split right. Both are follow-ups if
  the native tabs feel wrong in use.
- Every window shares the tabbing identifier `ganymede.workspace` and
  `tabbingMode = .preferred`. SwiftUI may order the window front before
  `WindowReader` sees it, which is too late for AppKit to tab it, so
  `WorkspaceTabs.join` takes the main window at that moment and adds the
  new window to it on the next run loop.
- `WindowGroup(for:)` brings forward a window already showing the value
  it is opened with, so File › New Tab opened nothing when the front
  window showed that folder. New Tab and New Window now open the group
  by id (`openWindow(id:)`), which always makes a window. The folder,
  and for New Window "open alone", travel in a request that the new
  window reads as it opens; one no window takes lapses after 2 s, so it
  can't make a later window open untabbed.
- Windows restored at launch are not added to each other by hand, so
  separate windows stay separate across a relaunch.
