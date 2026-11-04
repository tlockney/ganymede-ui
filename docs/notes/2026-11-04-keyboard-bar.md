## 2026-11-04, keys above the on-screen keyboard (#209)

- While a cell is edited with the on-screen keyboard, a bar above it has
  Run, esc, tab, the four arrows and 18 symbols. It's page code
  (`src/lib/keyboard-bar.ts`, `KeyboardBar.tsx`), so the iPhone and iPad
  apps and the browser on either get it. The native route, a
  `UIInputView` as the web view's `inputAccessoryView`, means swapping
  the class of WebKit's private `WKContentView` at run time.
- The bar shows when three things hold: the pointer is coarse, a cell's
  editor has the focus in edit mode, and the visual viewport is more than
  120 points shorter than the window at a scale of 1. The on-screen
  keyboard shrinks only the visual viewport; a hardware keyboard shrinks
  nothing, so it gets no bar; a pinch zoom shrinks it at a scale above 1.
  It sits at `visualViewport.offsetTop + height`, moved up its own
  height, and follows the viewport's `resize` and `scroll`.
- Tab and the arrows are synthetic `keydown` events sent to the focused
  editor. They go through the document's capture listener first, as a
  real key does, so Tab completes from the kernel, and CodeMirror's
  keymap handles what's left (checked with a real `EditorView` in jsdom).
  Run and esc run `run-and-advance` and `command-mode`, so a rebound
  Shift+Enter doesn't change what Run does. Symbols go through
  `replaceSelection`.
- The buttons call `preventDefault` on `pointerdown` and `mousedown` and
  have `tabIndex={-1}`: a tap must not take the focus, or the keyboard
  goes down.
- Untried on a real iPhone. WebKit's own bar (the arrows and Done) stays
  under ours; hiding it is the same private-class swap as above.
