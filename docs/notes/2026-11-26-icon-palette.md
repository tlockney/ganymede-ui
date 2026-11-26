## 2026-11-26, icon palette tokens (#845)

Thomas found the UI bland: system blue and grey say nothing about what
Ganymede is. This is the first step of #844, bringing the app icon's
palette — the navy sky, the cream moon, its orange orbit — into the
tokens and the rules that read them. No layout, spacing or new
components.

- `src/styles/app.css` (`:root` and its dark block). `--accent` is the
  icon's orange (`#e8890f` light, `#f9a03f` dark), for icons only, where
  3:1 is enough. `--accent-fill` is the orange under the new `--on-accent`
  (`#2a1600`), which replaces white text on every filled rule: the
  primary button, the Run button, notice actions and their picker,
  highlighted menu and palette rows, the keyboard bar's primary key and
  the journal's follow button. White on `#f9a03f` is 2.07:1; `--on-accent`
  on it is 8.35:1. The palette's shortcut keys, white at 80%, dim
  `--on-accent` the same way. `--accent-text` is the orange for text.
  Surfaces take the cream and the navy (`--window-bg`, `--sidebar-*`,
  `--toolbar-bg`, `--sheet-bg`), the body's two gradients are navy and
  orange, and `--brand-*` name the icon's four colors for later steps.
  `--ready` (`#3d6fd6` light, `#8fb3ff` dark) is the sidebar's idle dot,
  which was green — green stays the journal's executed-cell dot.
- `--accent-text` light is `#924900` rather than `#9a4d00`: at the insert
  row's quiet 0.85 opacity, `#9a4d00` reads 4.31:1 on the page, and this
  is the least darkening that passes (4.58:1). Nothing else moved:
  `--text*`, `--separator` and `--hover` still pass as they were.
- `src/styles/jupyter.css`: `.notebook-page`'s cells are white cards on
  the cream page in light and `#232842` on the navy in dark, with borders
  tinted navy or white to match.
- `src/styles/contrast.test.ts` collects the filled rules by
  `var(--on-accent)` on a `var(--accent…)` background and checks the pair
  at 4.5:1 in both themes, as it checked white before, and a new test
  fails any rule that still puts `#fff`, `#ffffff` or `white` text on one.
- `apple/`: an `AccentColor` colorset in the Mac and iOS asset catalogs
  (`#E8890F` light, `#F9A03F` dark), and
  `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor` on both
  app targets, so the native controls follow the page.
