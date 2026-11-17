## 2026-11-17, Mac editor text hidden by its line-number ruler (#661)

Text files opened in the Mac editor showed their line numbers but no
text. `LineNumberRuler.draw(_:)` filled the whole dirty rect with the
text background color. Views built against the macOS 14 SDK and later
default to `clipsToBounds = false`, and AppKit may then hand a view a
dirty rect larger than its bounds, so the fill covered the text view
beside the ruler. The line numbers, drawn after the fill, stayed
visible, and their spacing showed the text was loaded and laid out.

The ruler now sets `clipsToBounds = true` and fills only the part of
the dirty rect inside its bounds. `LineNumberRulerTests` draws the
ruler with a dirty rect as wide as the editor and checks that nothing
outside the ruler is painted.

Lesson: an AppKit view that fills its `dirtyRect` must clip to its
bounds or intersect the rect with them first.
