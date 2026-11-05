## 2026-11-05, iPhone notebook rendering (#263)

- A new notebook's first cell showed its + Code / + Text bar above its
  input. `decorate` appends the bar and re-appends it after `cell.ready`,
  but that cell adds its input area later still. A `MutationObserver` on
  the cell's children now moves the bar back to the end whenever they
  change, and disconnects when the cell is disposed.
- The narrow-window rules that give a phone its 12px gutter skip
  `chrome-native`, so that the Mac's narrow web view beside its own
  sidebar keeps its padding. They also skipped the iPhone app, which
  loads `chrome=native` since #253, leaving 32px each side. The phone
  rule now applies to `.touch-ui .window.chrome-native` too: the Mac's
  web view isn't `touch-ui` (App.tsx). The top gap is 8px under the
  app's bars, not 28px.
- JupyterLab stacks the prompt over the editor at 760px and under, so
  the "…" button and grip are moved down to the editor's top there.
- The toolbar's kernel line was a bare text node in a flex row, so it
  couldn't take an ellipsis and ran under the Run buttons at phone width.
  It is a span with `text-overflow: ellipsis` now.
- Checked by screenshots in Chromium's iPhone 15 emulation with the
  in-browser backend; not yet on a device.
