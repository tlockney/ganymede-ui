## 2026-11-27, the redesign's mockups kept in the repo (#893)

- `docs/design/mac-visual-redesign/` holds the design canvas's boards for
  #844 as images, with their sources, and a README on how the design went
  from v0.17.1's problems through directions A to D to the Chosen board,
  and the two reviews after it.
- The README ends with each step's issue and state, so the gap between
  the board and the app stays visible: the toolbar (#892) and the tabs
  come next, then the page type and selection ring (#897) and the
  sidebar's float, tint and badges (#896).
- The boards' `.dc.html` sources are left as the canvas wrote them, so
  `.prettierignore` skips them. They need the canvas's runtime to render;
  the images were rendered from them.
