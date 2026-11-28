## 2026-11-28, code cell output well and error rail (#960)

Separated code and output inside `.jp-CodeCell` cards while preserving the
single-card geometry and `overflow: visible` behavior (so the floating cell
toolbar and `.gn-mod-wide` outputs stay unclipped):

- Added `--cell-output-bg` (`#f6f3ec` light, `#1b2036` dark) in `src/styles/app.css`
  and applied a hairline seam + recessed output well on non-empty
  `.jp-CodeCell > .jp-Cell-outputWrapper` in `src/styles/jupyter.css`, with a
  quiet `↳` marker in the desktop left gutter (`content: '↳' / ''`) and responsive
  handling across desktop, `.touch-ui` tablet, and narrow phone (`<= 600px`) layouts.
- Removed the duplicate hairline above `.gn-output-meta` now that the divider sits
  at the code/output seam.
- Added a 2px red left rail on error outputs (`.jp-OutputArea-output:has(> .gn-output-bar[data-kind='error'])`)
  and cleared the bar's own left border inside code cells so failures don't draw
  two parallel red stripes.
- Verified WCAG AA (>= 4.5:1) contrast on `--cell-output-bg` in both light and dark
  themes in `src/styles/contrast.test.ts`, plus Playwright coverage in
  `e2e/cell-card.spec.ts`.
