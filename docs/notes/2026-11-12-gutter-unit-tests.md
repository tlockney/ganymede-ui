## 2026-11-12, unit tests for the iOS line-number gutter (#524)

#520 fixed a crash in the iOS editor's gutter (#517) without a unit test,
because the iOS test target (`GanymedeTests-iOS`) didn't compile the
editor. It now compiles `LineNumbers.swift`, which takes its font
straight from `CodeFont` (as `Highlighting.font` did) so the target
needn't link Neon and the tree-sitter packages. The gutter type and
its `textView` are internal rather than private so the tests can see
them; the text view's `gutter` is `private(set)`.

`LineNumberGutterTests` (iOS only, `#if os(iOS)`, since the Mac target
compiles the same folder) makes the text view as the editor does
(TextKit 1) and checks that:

- outside a window, a layout sets the inset but makes no gutter;
- in a window, a layout makes one gutter, sized to the line count, whose
  `textView` is its superview;
- moving into a window asks for the layout that makes the gutter;
- a gutter taken down and laid out again is the same one, back in the
  text view, which it finds again;
- moving between windows keeps the same gutter, with one in the
  subviews;
- a gutter outside a text view draws without crashing.

These are the invariants #520 relies on. They don't reproduce #517's
crash, whose cause isn't known, so the device check in #273 stays.
