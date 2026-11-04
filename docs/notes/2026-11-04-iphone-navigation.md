## 2026-11-04, iPhone: folder list and pushed notebook (#209)

The iPhone now loads the page with `chrome=native`, as the iPad and Mac
do, and draws its own chrome: a `NavigationStack` whose root is the iPad's
sidebar (`IPadSidebar`) and whose one screen is the notebook. The
notebook's controls (`IPadNotebookToolbar`) go in the bottom toolbar.

- The page has to outlive the notebook screen. Popping a view destroys
  its `UIViewRepresentable`'s view and coordinator, which would reload the
  page (and its in-app kernels) every time the user went back to the list.
  `WebViewStore` keeps one `WKWebView` and its coordinator; the
  representable returns them from `makeCoordinator` and `makeUIView`.
- The list needs the page while the notebook isn't shown: Running comes
  from `PageState`, and tapping a notebook runs the page's `open`. So the
  store loads the page off screen as soon as the server is up, before the
  first push. WebKit runs a page that isn't in a window, though it may
  throttle its timers.
- New Notebook from the list also pushes the notebook, on the iPad too
  (it hides the portrait sidebar), since the page opens what it makes.
- Not done yet from #209: Recents on the list (with #240), the keyboard
  accessory bar, and Rename in the ⋯ menu (rename is on the list's
  long-press menu). The check on a real iPhone is still to do.
