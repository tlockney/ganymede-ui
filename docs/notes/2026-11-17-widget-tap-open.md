## 2026-11-17, widget tap to open, and the switch applies at once (#494)

A tap on a notebook widget now opens that notebook. The widget view sets
`.widgetURL` to `ganymede://open?path=<notebook>`, built by
`WidgetState.openURL(notebook:)` with every character but unreserved ones
and `/` escaped, so `&`, `+`, `#` and spaces in a path keep their meaning.
On the Mac it arrives as a `kAEGetURL` Apple Event
(`GanymedeApp.getURL`) and reaches `AppURLHandler.handle`; on iOS it
arrives through `onOpenURL` and reaches `LinkOpener.handle`, each with its
usual checks (granted folders on iOS). The
route is always `open`, never `run`: a tap on a widget shouldn't run code.
A `.shown` widget links to its notebook, and a `.missing` one too, so it
can be rerun; off and unset have no link. Only an absolute path has a
link: Run Script on Device publishes under pseudo-paths such as
`shortcuts/foo.ipynb`, which no link can open.

The Notebook Widgets switch used to be read once, when a window's bridge
was made, so a notebook already open couldn't publish after the switch was
turned on, or kept publishing after it was turned off. `addWidgets` now
takes `enabled`, asked on each call (in the parameter check, which runs
before the handler), and `KernelHost.systemBridge` always installs it, reading the
App Group's switch. While it is off `widget.update` fails `unavailable`
and keeps nothing.

Side effect: `hello` lists `widget.update` whenever `addWidgets` ran,
which is now always, so `device.has('widget')` is true even with the
switch off, and the call then fails `unavailable`. A cell that wants to
know should handle that error. Left for #494's other items: clearing what
was published when the switch goes off, and dropping a deleted notebook's
entries.

A stored link holds the notebook's absolute path, as the widget content
is keyed by it already, so an iOS container path that changes after an
update can break old taps until the notebook publishes again.

By hand (not run): turn on Notebook Widgets, run a notebook cell that
calls `device.widget.update`, add the widget and pick the notebook and
kind, then tap it: the app opens that notebook. Repeat with a path
that has a space and an `&`, and with a widget whose notebook hasn't
published.

Not run here: the Swift tests (`WidgetStateTests`, `RunTests`) need Xcode,
which this machine doesn't have, so CI is their first run.
