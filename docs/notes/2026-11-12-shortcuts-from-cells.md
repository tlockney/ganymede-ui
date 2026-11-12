## 2026-11-12, Run a Shortcut from a cell (ganymede-device#40)

The apps register `device.shortcuts.run` (ganymede-device#129), the last
part of app automation (#301). The bridge opens the Shortcuts app's
x-callback URL; the Shortcuts app calls back to
`ganymede://device-callback/shortcuts/<token>/success|error|cancel`.

`KernelHost.shortcuts` is one `ShortcutCalls` for every bridge the app
makes, so a callback reaches the call whichever window started it. On
the Mac the app delegate's Get URL handler gives each URL to it first
and passes the rest to `AppURLHandler`; on iPad and iPhone the main
window's `onOpenURL` does, and the iOS target now registers the
`ganymede` scheme, which it didn't need before. Other `ganymede://`
URLs still do nothing there.

The call is foreground-only: Shortcuts' Run Script on Device and the
share sheet don't list it. On iPad and iPhone the kernel stops about 30
seconds after the app leaves the screen, so whether a short Shortcut
still answers is a by-hand check in #273.
