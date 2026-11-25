## 2026-11-25, Tall framed output scrolls past the cap (#795)

Trusted HTML and JavaScript outputs (and anywidgets) render in a
sandboxed frame that grows to its content's height, up to 20,000 px so a
runaway output can't grow the notebook forever. The frame's document
hid its overflow, so whatever lay past 20,000 px could never be seen.

Now the frame's own sizer script, which already posts its height to the
page, also sets the document's `overflow-y` to `auto` once the content
is taller than the cap, and back to `hidden` when it isn't. The page
can't do it, since the frame's origin is opaque. Outputs under the cap
are unchanged: overflow stays hidden, so no inner scrollbar. A scrollbar
that narrows the content only makes it taller, so the switch can't flip
back and forth.

`e2e/tall-output.spec.ts` runs a short and a 25,000 px HTML output on a
real kernel: the short frame has nothing to scroll, the tall one stops
at 20,000 px, and wheeling over it reaches its last line. Without the
change the tall frame's overflow stays hidden and the wheel never gets
there.

Not checked on a device: the frame scrolling with a finger in the iPad
and iPhone web view.
