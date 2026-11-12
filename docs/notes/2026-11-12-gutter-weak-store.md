## 2026-11-12, iOS line-number gutter crash (#517)

Sentry reported `EXC_BAD_ACCESS` (`KERN_INVALID_ADDRESS` at 0x8) in
`swift_unknownObjectWeakAssign`, called from
`CodeUITextView.layoutSubviews` at `gutter.textView = self`, from a Core
Animation layout pass (0.7.0 TestFlight, iPhone, two events in twelve
seconds). The store only runs when the gutter has no superview: on the
first layout, or on a layout after UIKit took the subviews down. A bad
address that low points at storage that wasn't set up, or at an object
on its way out, rather than at the text view's own code.

The gutter now holds no reference to the text view: it reads it from
`superview`. The text view makes the gutter on its first layout in a
window, keeps it in an optional (so a layout before Swift has set up the
class's storage reads nil instead of a bad pointer), and skips the
gutter when it has no window, which is the case while it is being torn
down. `didMoveToWindow` asks for a layout, so the gutter still appears
on screen.

CI has no way to provoke the crash, so the check is by hand on an
iPhone or iPad (ganymede-ui#273): open, edit, close and switch notebooks
and files with line numbers showing, and watch Sentry for
`GANYMEDE-APPLE-5` after the next TestFlight build.
