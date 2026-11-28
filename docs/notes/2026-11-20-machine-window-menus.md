## 2026-11-20, machine window menus (#741)

In a machine's window on the Mac, some File and Kernel menu items acted on
this Mac.

- File > New Tab and New Window opened this device's start window.
  `WorkspaceTabs.Request` now carries a `WindowTarget` (not a folder) and
  `WorkspaceTabs.open(target:alone:with:)` takes one; `openStart(folder:)`
  wraps `.folder`. `WindowTarget.newTab(place:folder:root:)` picks it: a
  machine window's machine root, else the window's folder or the app's root.
- Two `Place.Capability` cases are this device's only, one for the kernel
  location and one for this device's own terminal. The kernel popover's Runs
  On and the whole Kernel > Advanced menu (with Manage Remotes, still in
  Settings) are hidden in a machine window, and File > New Terminal and New
  Terminal Tab are disabled.
  New Terminal On stays.
- `WindowTarget.opening(_:requested:root:)` is how a new window picks what
  it shows (its value, else the request, else the root), tested.
- By hand: #399, the #741 checks.
