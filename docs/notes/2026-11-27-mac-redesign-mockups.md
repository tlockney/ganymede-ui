## 2026-11-27, Mac redesign mockups in docs (#895)

The redesign's mockups (#844) lived only on a design canvas, and the
reasons behind them were spread over #844 and its comments. Thomas asked
for them in the repository, with a note on how the design got where it
is. `docs/design/mac-redesign/` now holds them.

- `README.md` tells the rounds in order: what read as bland in v0.17.1,
  the four directions (A Tahoe native, B Workbench, C Document, D
  Branded workspace), the choice of A with D's colours and branding, the
  review that refined it, the second review (Journal mode, tab states,
  Split View, iPhone) and the step 4 sidebar board. A table maps each
  board to its step and that step's state, and a last section puts the
  app at step 4b (`ab5e893`) beside the chosen board, with the gaps left.
- `boards/` has the fifteen boards rendered with WebKit at their canvas
  sizes, as 2× JPEG (about 6.7 MB in all). JPEG rather than PNG keeps
  them near half the size, and the boards are flat colour and text, so
  the loss doesn't show at the sizes they are read.
- `source/` has each board's HTML, standalone, so a board can be opened
  and inspected without the canvas. They differ from the canvas's files
  only in what the canvas runtime needed: no runtime script, links between
  boards ending in `.html`, and the v0.17.1 screenshot as a file beside
  them. Prettier skips them (`.prettierignore`), so they stay as exported.
- `docs/apps.md` points at the folder from the start of its Mac section.
