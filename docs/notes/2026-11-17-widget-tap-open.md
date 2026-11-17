## 2026-11-17, widget tap to open, and the switch applies at once (#494)

A tap on a notebook widget now opens that notebook. The widget view sets
`.widgetURL` to `ganymede://open?path=<notebook>`, built by
`WidgetState.openURL(notebook:)` with every character but unreserved ones
and `/` escaped, so `&`, `+`, `#` and spaces in a path keep their meaning.
It goes through the app's `onOpenURL` and so through `AppURLHandler` and
`LinkOpener`, with their checks, including the granted folders on iOS. The
route is always `open`, never `run`: a tap on a widget shouldn't run code.
Only a `.shown` widget has a link; the off, unset and missing messages
don't.

The Notebook Widgets switch used to be read once, when a window's bridge
was made, so a notebook already open couldn't publish after the switch was
turned on, or kept publishing after it was turned off. `addWidgets` now
takes `enabled`, asked on each call (in the parameter check and in the
handler), and `KernelHost.systemBridge` always installs it, reading the
App Group's switch. While it is off `widget.update` fails `unavailable`
and keeps nothing.

Side effect: `hello` lists `widget.update` whenever `addWidgets` ran,
which is now always, so `device.has('widget')` is true even with the
switch off, and the call then fails `unavailable`. A cell that wants to
know should handle that error. Left for #494's other items: clearing what
was published when the switch goes off, and dropping a deleted notebook's
entries.

Not run here: the Swift tests (`WidgetStateTests`, `RunTests`) need Xcode,
which this machine doesn't have, so CI is their first run.
