## 2026-11-04, keys above the on-screen keyboard (#209)

- While a cell is edited with the on-screen keyboard, a bar above it has
  Run, esc, tab, the four arrows and 18 symbols. It's page code
  (`src/lib/keyboard-bar.ts`, `KeyboardBar.tsx`), so the iPhone and iPad
  apps and the browser on either get it. The native route, a
  `UIInputView` as the web view's `inputAccessoryView`, means swapping
  the class of WebKit's private `WKContentView` at run time.
- The bar shows when three things hold: a touch screen (`TOUCH_QUERY`),
  a cell's editor has the focus in edit mode, and the visual viewport is
  more than 120 points shorter than the window without the keyboard, at
  a scale of 1. In Safari the keyboard shrinks only the visual viewport,
  but in the apps SwiftUI's keyboard avoidance can shrink the web view,
  and `innerHeight` with it, so the page keeps the height at each width
  from while no text field had the focus (a cell, the sidebar's search,
  an `input()` box), when no keyboard can be up. (The
  tallest height seen, as first written, never went down: a Stage Manager
  window made shorter then showed the bar with a hardware keyboard.)
  Rotating with the keyboard up hides the bar until it comes up again.
  A hardware keyboard
  shrinks nothing, so it gets no bar; a pinch zoom shrinks the viewport
  at a scale above 1.
  It sits at `visualViewport.offsetTop + height`, moved up its own
  height, and follows the viewport's `resize` and `scroll`.
- Tab and the arrows are synthetic `keydown` events sent to the focused
  editor, with `keyCode` set by hand: a constructed `KeyboardEvent` has
  `keyCode` 0, and Lumino's keyboard layout matches by `keyCode` only, so
  without it Tab never reached the completer (a test binds Tab in a real
  `CommandRegistry`). They go through the document's capture listener
  first, as a real key does, so Tab completes from the kernel, and CodeMirror's
  keymap handles what's left (checked with a real `EditorView` in jsdom).
  Run and esc run `run-and-advance` and `command-mode`, so a rebound
  Shift+Enter doesn't change what Run does. Symbols are a CodeMirror
  transaction with `userEvent: 'input.type'`, as typing is: into every
  cursor, and not into a read-only cell. JupyterLab's `replaceSelection`
  writes to the model at the first cursor and ignores read-only.
- On a touch screen (`TOUCH_QUERY`) the cell editors' code font is
  16px: iOS zooms the page when it focuses text smaller than that, and
  the bar shows only at scale 1, so at 12.5px it would never have shown
  on an iPhone. Outputs keep 12.5px.
- The buttons call `preventDefault` on `pointerdown` and `mousedown` and
  have `tabIndex={-1}`: a tap must not take the focus, or the keyboard
  goes down.
- The browser keeps the caret above the keyboard, which is where the
  bar is drawn. While the bar shows, each `selectionchange` scrolls the
  caret's scroller up by however much the caret is under the bar.
- Untried on a real iPhone. WebKit's own bar (the arrows and Done) stays
  under ours; hiding it is the same private-class swap as above.
