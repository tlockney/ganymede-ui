## 2026-11-13, Cell toolbar recheck follow-ups (#553)

Review findings on #552, the recheck that hides the cell toolbar over a
long first heading.

A notebook parked in the hidden holder (switching to another notebook)
has a 0x0 input area. The resize observer fired, the tracker checked,
found no toolbar to measure, and cleared `jp-toolbar-overlap`, so the
toolbar could show over the heading for a moment on return. The
observer now ignores a 0x0 size.

The recheck now sends the cell `Widget.ResizeMessage.UnknownSize`, so
`Cell.onResize` emits `displayChanged` through its own debouncer,
instead of casting the signal and emitting it from outside. The
disposed check comes before reading `cell.model`, which is null once
the cell is disposed.

The e2e test waited a fixed second, and `toBeHidden` also passes while
the toolbar is attached but not yet checked (the tracker attaches it
hidden). The page now counts pending idle callbacks; the test waits for
the toolbar to be attached, two frames for the observer, and none
pending, then checks once. Without the recheck it fails every time.
Note: `toBeHidden({ timeout: 0 })` means no timeout, not "now".
