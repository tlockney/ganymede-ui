## 2026-11-25, Tall framed output scrolls past the cap (#795)

Trusted HTML and JavaScript outputs (and anywidgets) render in a
sandboxed frame that grows to its content's height, up to 20,000 px so a
runaway output can't grow the notebook forever. The frame's document
hid its overflow, so whatever lay past 20,000 px could never be seen.

Now the frame's own sizer script, which already posts its height to the
page, also sets the document's `overflow-y` to `auto` once the content
is taller than the cap. The page can't do it, since the frame's origin
is opaque. Outputs that never reach the cap are unchanged: overflow
stays hidden, so no inner scrollbar.

Once on, `auto` stays on. The first version switched back to `hidden`
under the cap, and the pre-push review found that it flips every frame
with classic scrollbars ("Show scroll bars: Always" on the Mac) when the
content's height follows its width, such as a full-width aspect-ratio
box or image just over the cap: the scrollbar takes width, the content
drops under the cap, the scrollbar goes, and round again. Content that
shrinks back under the cap fits the frame, so `auto` shows no scrollbar
and nothing scrolls. In that one band (over the cap at full width,
under it with a scrollbar) a scrollbar stays with nothing to scroll.

`e2e/tall-output.spec.ts` runs a short and a 25,000 px HTML output on a
real kernel: the short frame has nothing to scroll, the tall one stops
at 20,000 px, and wheeling over it reaches its last line. Without the
change the tall frame's overflow stays hidden and the wheel never gets
there. `e2e/tall-output-scrollbars.spec.ts` turns on Chromium's classic
scrollbars and grows a full-width box to 5 px over the cap: over a
second the page gets no more heights and the frame keeps its height and
scrollbar (switching back posted 64 heights in that second), and when
the box shrinks well under the cap the scrollbar goes and `scrollTop` is 0.

CI can't scroll the apps' web views, so the by-hand checks are on #273
(a finger scroll on iPad and iPhone reaches the last line, then the
notebook carries on) and #399 (the Mac app with "Show scroll bars:
Always": the wheel reaches the end, with no flicker).
