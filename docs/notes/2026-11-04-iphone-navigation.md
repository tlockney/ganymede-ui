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
  store loads the page as soon as the server is up, before the first
  push. WebKit suspends a web view that is in no window (as `KernelHost`
  found), and the in-app kernels' web view is a subview of this one, so
  while the list shows the page waits in `parking`, a hidden 1×1 view
  behind the list (`ParkedPage`). Pushing the notebook moves the web view
  into its screen; when that screen goes, `dismantleUIView` parks it
  again. It also gets `inactiveSchedulingPolicy = .none` on iOS 17.
- A tap on the list can come before the page is ready for commands.
  `PageModel` now queues commands until the page has posted its first
  state, so the pushed notebook screen still opens what was tapped.
- Errors from starting the server and from the keychain show on the list
  as well, since the notebook screen may never be opened.
- New Notebook from the list also pushes the notebook, on the iPad too
  (it hides the portrait sidebar), since the page opens what it makes.
- Not done yet from #209: Recents on the list (with #240), the keyboard
  accessory bar, and Rename in the ⋯ menu (rename is on the list's
  long-press menu). The check on a real iPhone is still to do.
